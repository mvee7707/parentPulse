// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';

test.use({ storageState: 'storageState.json' });
test.setTimeout(600000);

/** Parse the raw scraped rows into structured assignment objects */
function parseAssignmentRows(rows) {
  const assignments = [];
  let currentCategory = null;

  for (const row of rows) {
    // Category header row: ["CW", "Classwork", ""] or ["PJ", "Projects", ""]
    if (row.length === 3 && row[2] === '' && row[0].length <= 4 && row[1] !== 'Classwork' && !row[0].includes('.')) {
      // Could be a category label — but the actual pattern is: short code, full name, empty
      // We detect it as a category if it has no numeric content
      if (!/\d/.test(row[0]) && row[1] !== '' && row[2] === '') {
        currentCategory = row[1];
        continue;
      }
    }

    // Category average row
    if (row[0] === 'Category Average') {
      continue;
    }

    // Term grade row: ["Term Grade", "88.75", "B", ""]
    if (row[0] === 'Term Grade') {
      continue; // captured separately below
    }

    // Assignment row: [name, pts, max, avg, status, due, curve, bonus, penalty, note]
    if (row.length >= 6 && /^\d/.test(row[5]) || (row.length >= 6 && row[5].match(/^\d{2}\/\d{2}/))) {
      assignments.push({
        category: currentCategory,
        name:     row[0],
        pts:      parseFloat(row[1]) || null,
        max:      parseFloat(row[2]) || null,
        avg:      parseFloat(row[3]) || null,
        status:   row[4] || null,
        due:      row[5] || null,
        curve:    parseFloat(row[6]) || 0,
        bonus:    parseFloat(row[7]) || 0,
        penalty:  parseFloat(row[8]) || 0,
        note:     row[9] || null,
      });
    }
  }

  return assignments;
}

/** Extract term grade and points summary from raw rows */
function parseTermSummary(rows) {
  let termGrade = null, letterGrade = null, pointsSummary = null;

  for (const row of rows) {
    if (row[0] === 'Term Grade') {
      termGrade    = parseFloat(row[1]) || null;
      letterGrade  = row[2] || null;
    }
    // "Points = 355/400.0" comes through as a single-cell row
    if (row.length === 1 && row[0].startsWith('Points =')) {
      pointsSummary = row[0];
    }
  }

  return { termGrade, letterGrade, pointsSummary };
}

test('scrape all grades by student', async ({ page }) => {
  await page.goto('https://sis.factsmgt.com/family-portal/');
  await page.waitForLoadState('networkidle');

  if (page.url().includes('family-chooser')) {
    await page.getByRole('radio', { name: /Vora, Manish/i }).click();
    await page.getByRole('button', { name: /set family/i }).click();
    await page.waitForLoadState('networkidle');
  }

  await page.locator('text=Student').first().click();
  await page.getByRole('link', { name: 'Grades' }).click();
  await page.waitForLoadState('networkidle');

  const outerHandle = await page.locator('iframe').first().elementHandle();
  const outer = await outerHandle.contentFrame();
  if (!outer) throw new Error('Outer iframe not found');

  const gradebookLink = outer.getByRole('link', { name: 'Gradebook Report' });
  if (await gradebookLink.isVisible()) {
    await gradebookLink.click();
    await outer.waitForLoadState('networkidle');
  }

  // nth(0)=student, nth(1)=class, nth(2)=term
  const allSelects   = outer.locator('select');
  const studentDropdown = allSelects.nth(0);
  const classDropdown   = allSelects.nth(1);
  const termDropdown    = allSelects.nth(2);

  await studentDropdown.waitFor({ timeout: 30000 });

  const students = await studentDropdown.evaluate(sel =>
    [...sel.options].map(o => ({ value: o.value, label: o.text.trim() }))
  );
  const classes = await classDropdown.evaluate(sel =>
    [...sel.options].map(o => ({ value: o.value, label: o.text.trim() }))
  );
  const terms = await termDropdown.evaluate(sel =>
    [...sel.options].map(o => ({ value: o.value, label: o.text.trim() }))
  );

  console.log(`Students : ${students.map(s => s.label).join(', ')}`);
  console.log(`Classes  : ${classes.length}`);
  console.log(`Terms    : ${terms.length}`);

  for (const student of students) {
    console.log(`\n═══ Student: ${student.label} ═══`);

    // Top-level structure saved per student
    const studentData = {
      student: student.label,
      scrapedAt: new Date().toISOString(),
      classes: {}
    };

    await studentDropdown.selectOption({ value: student.value });
    await outer.waitForLoadState('networkidle');

    for (const cls of classes) {
      console.log(`  Class: ${cls.label}`);
      studentData.classes[cls.label] = { terms: {} };

      await classDropdown.selectOption({ value: cls.value });
      await outer.waitForLoadState('networkidle');

      for (const term of terms) {
        await termDropdown.selectOption({ value: term.value });
        await outer.waitForLoadState('networkidle');

        const assignmentHandle = await outer.locator('iframe').first().elementHandle();
        const assignmentFrame  = await assignmentHandle?.contentFrame();

        if (!assignmentFrame) {
          console.warn(`    [skip] no iframe — ${cls.label} / ${term.label}`);
          studentData.classes[cls.label].terms[term.label] = { assignments: [], termGrade: null, letterGrade: null };
          continue;
        }

        const hasContent = await assignmentFrame
          .locator('table tbody tr td:not(:empty)')
          .first()
          .waitFor({ state: 'attached', timeout: 15000 })
          .then(() => true)
          .catch(() => false);

        if (!hasContent) {
          console.warn(`    [skip] no data  — ${cls.label} / ${term.label}`);
          studentData.classes[cls.label].terms[term.label] = { assignments: [], termGrade: null, letterGrade: null };
          continue;
        }

        const rawRows = await assignmentFrame.$$eval('table', tbls =>
          tbls.flatMap(table =>
            [...table.querySelectorAll('tbody tr')].map(row =>
              [...row.querySelectorAll('td')].map(c => c.textContent.trim())
            )
          )
        );

        const rows        = rawRows.filter(r => r.some(cell => cell !== ''));
        const assignments = parseAssignmentRows(rows);
        const summary     = parseTermSummary(rows);

        studentData.classes[cls.label].terms[term.label] = {
          ...summary,
          assignments,
        };

        console.log(`    ${term.label}: ${assignments.length} assignments — grade ${summary.termGrade ?? 'N/A'} ${summary.letterGrade ?? ''}`);
      }
    }

    
    // Write one file per student — clear old file first
const filename = `./jsonData/grades_${student.label.toLowerCase()}.json`;

// Ensure no duplicates: delete old file if it exists
if (fs.existsSync(filename)) {
  fs.unlinkSync(filename);
}

  // Now write fresh data
  fs.writeFileSync(filename, JSON.stringify(studentData, null, 2));
  console.log(`  → Saved ${filename}`);

  }

  console.log('\n✓ All done.');
  expect(students.length).toBeGreaterThan(0);
});
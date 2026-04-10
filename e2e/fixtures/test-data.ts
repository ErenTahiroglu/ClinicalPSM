import fs from 'fs'
import path from 'path'

// Sample CSV data for PSM analysis
export const SAMPLE_CSV_DATA = `patient_id,treatment,outcome,age,gender,blood_pressure,cholesterol
1,0,0.5,65,Male,120,200
2,1,0.8,72,Female,130,220
3,0,0.3,58,Male,115,180
4,1,0.9,69,Female,135,230
5,0,0.4,61,Male,118,190
6,1,0.7,75,Female,140,240
7,0,0.6,63,Male,122,195
8,1,0.8,70,Female,128,210
9,0,0.5,67,Male,125,205
10,1,0.9,73,Female,132,225
11,0,0.4,59,Male,117,185
12,1,0.7,71,Female,129,215
13,0,0.5,64,Male,121,198
14,1,0.8,68,Female,127,208
15,0,0.3,60,Male,116,182
16,1,0.9,74,Female,138,235
17,0,0.6,66,Male,124,203
18,1,0.7,76,Female,142,245
19,0,0.4,62,Male,119,192
20,1,0.8,77,Female,145,250`

// CSV with missing values
export const CSV_WITH_MISSING_VALUES = `patient_id,treatment,outcome,age,gender,blood_pressure,cholesterol
1,0,0.5,65,Male,120,
2,1,,72,Female,130,220
3,0,0.3,,Male,115,180
4,1,0.9,69,,135,230
5,0,0.4,61,Male,,190
6,1,0.7,75,Female,140,
7,0,0.6,63,Male,122,195
8,1,0.8,70,Female,128,210
9,,0.5,67,Male,125,205
10,1,0.9,73,Female,132,225`

// CSV with invalid treatment (not binary)
export const CSV_INVALID_TREATMENT = `patient_id,treatment,outcome,age,gender
1,0,0.5,65,Male
2,1,0.8,72,Female
3,2,0.3,58,Male
4,1,0.9,69,Female
5,0,0.4,61,Male
6,3,0.7,75,Female`

// CSV with no variance in treatment
export const CSV_NO_VARIANCE = `patient_id,treatment,outcome,age,gender
1,0,0.5,65,Male
2,0,0.8,72,Female
3,0,0.3,58,Male
4,0,0.9,69,Female
5,0,0.4,61,Male
6,0,0.7,75,Female`

// Large dataset for performance testing
export const LARGE_CSV_DATA = (() => {
  let csv = 'patient_id,treatment,outcome,age,gender,blood_pressure,cholesterol\n'
  for (let i = 1; i <= 500; i++) {
    const treatment = i % 2 === 0 ? 1 : 0
    const outcome = Math.random()
    const age = 50 + Math.floor(Math.random() * 30)
    const gender = i % 2 === 0 ? 'Female' : 'Male'
    const bp = 110 + Math.floor(Math.random() * 40)
    const chol = 180 + Math.floor(Math.random() * 80)
    csv += `${i},${treatment},${outcome.toFixed(2)},${age},${gender},${bp},${chol}\n`
  }
  return csv
})()

// CSV with special characters and edge cases
export const CSV_EDGE_CASES = `patient_id,treatment,outcome,age,gender,notes
1,0,0.5,65,Male,"Patient with diabetes"
2,1,0.8,72,Female,"History of hypertension"
3,0,0.3,58,Male,""
4,1,0.9,69,Female,"Smoker, 20 pack-years"
5,0,0.4,61,Male,"Patient with ""multiple"" conditions"
6,1,0.7,75,Female,"None"
7,0,0.6,63,Male,"Regular exercise"
8,1,0.8,70,Female,""
9,0,0.5,67,Male,"Previous surgery"
10,1,0.9,73,Female,"Medication: A,B,C"`

// Invalid file content
export const INVALID_FILE_CONTENT = `This is not a CSV file
It's just plain text
With no structure whatsoever`

// CSV with only header
export const CSV_ONLY_HEADER = `patient_id,treatment,outcome,age,gender`

// CSV with malformed rows
export const CSV_MALFORMED = `patient_id,treatment,outcome,age,gender
1,0,0.5,65,Male
2,1,0.8,72
3,0,0.3,58,Male,ExtraColumn
4,1,0.9,69,Female
5,0,0.4,61,Male`

// Ensure fixtures directory exists
const fixturesDir = path.join(__dirname, 'fixtures')
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true })
}

// Write test files
fs.writeFileSync(path.join(fixturesDir, 'sample-data.csv'), SAMPLE_CSV_DATA)
fs.writeFileSync(path.join(fixturesDir, 'csv-with-missing.csv'), CSV_WITH_MISSING_VALUES)
fs.writeFileSync(path.join(fixturesDir, 'csv-invalid-treatment.csv'), CSV_INVALID_TREATMENT)
fs.writeFileSync(path.join(fixturesDir, 'csv-no-variance.csv'), CSV_NO_VARIANCE)
fs.writeFileSync(path.join(fixturesDir, 'large-dataset.csv'), LARGE_CSV_DATA)
fs.writeFileSync(path.join(fixturesDir, 'csv-edge-cases.csv'), CSV_EDGE_CASES)
fs.writeFileSync(path.join(fixturesDir, 'invalid-file.txt'), INVALID_FILE_CONTENT)
fs.writeFileSync(path.join(fixturesDir, 'csv-only-header.csv'), CSV_ONLY_HEADER)
fs.writeFileSync(path.join(fixturesDir, 'csv-malformed.csv'), CSV_MALFORMED)

console.log('Test data fixtures created successfully')

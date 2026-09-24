import assert from 'node:assert/strict';
import test from 'node:test';
import { bestByName, chooseDistributor, distributorFilenameScore } from '../src/services/distributorResolver.js';

test('uses the distributor area to resolve shortened report filenames', () => {
  const shehbaz = { name: 'SHEHBAZ MEDICINE COMPANY', area: 'SHEIKHUPURA' };
  const unrelated = { name: 'NH DISTRIBUTORS', area: 'SHEIKHUPURA' };

  assert.ok(distributorFilenameScore('SHEHBAZ SHEIKHUPURA.PDF', shehbaz) >= 0.5);
  assert.ok(
    distributorFilenameScore('SHEHBAZ SHEIKHUPURA.PDF', shehbaz)
      > distributorFilenameScore('SHEHBAZ SHEIKHUPURA.PDF', unrelated),
  );
});

test('does not resolve a filename from a matching city alone', () => {
  const distributor = { name: 'NH DISTRIBUTORS', area: 'SHEIKHUPURA' };
  assert.ok(distributorFilenameScore('SHEHBAZ SHEIKHUPURA.PDF', distributor) < 0.5);
});

test('splits concatenated distributor names in uploaded filenames', () => {
  const distributor = { name: 'KASHIF ENTERPRISES', area: 'KARACHI' };

  assert.ok(distributorFilenameScore('KashifEnterprises.pdf', distributor) >= 0.5);
});

test('normalizes common distributor filename spelling variants', () => {
  const distributor = { name: 'SHEHBAZ MEDICINE COMPANY', area: 'SHEIKHUPURA' };

  assert.ok(distributorFilenameScore('Shebaz Sheikupura.pdf', distributor) >= 0.5);
});

test('matches names joined without spaces, including short prefixes', () => {
  const distributor = { name: 'AL NOOR MEDICINE COMPANY', area: 'LAHORE' };

  assert.ok(distributorFilenameScore('ALNOOR MEDICINE COMPANY.pdf', distributor) >= 0.5);
  assert.ok(distributorFilenameScore('AlNoorMedicineCompany.pdf', distributor) >= 0.5);
});

test('ignores singular and plural differences', () => {
  const distributor = { name: 'ASLAM TRADERS', area: null };

  assert.ok(distributorFilenameScore('Aslam Trader.pdf', distributor) >= 0.5);
});

test('ignores legal suffixes that filenames usually omit', () => {
  const distributor = { name: 'M/S HAJI SONS PHARMA (PVT) LTD', area: 'ATTOCK' };

  assert.ok(distributorFilenameScore('Haji Sons Pharma.pdf', distributor) >= 0.5);
});

test('does not treat a short token alone as a match', () => {
  const distributor = { name: 'AL NOOR MEDICINE COMPANY', area: null };

  assert.ok(distributorFilenameScore('AL HABIB.pdf', distributor) < 0.5);
});

test('does not match joined short tokens across filename word boundaries', () => {
  const alFateh = { name: 'AL-FATEH PHARMA', area: 'Mian Channu' };
  const hm = { name: 'H&M PHARMA', area: 'PAKPATTAN' };

  assert.ok(distributorFilenameScore('AL-FATEH PHARMA.pdf', hm) < 0.5);
  assert.ok(distributorFilenameScore('AL-FATEH PHARMA.pdf', alFateh) > distributorFilenameScore('AL-FATEH PHARMA.pdf', hm));
});

test('does not match on generic trade words alone', () => {
  const ss = { name: 'S.S MEDICINE COMPANY', area: 'NOWSHERA' };
  const alNoor = { name: 'AL NOOR MEDICINE COMPANY', area: 'KOT ADDU' };

  assert.ok(distributorFilenameScore('ALNOOR MEDICINE COMPANY.pdf', ss) < 0.5);
  assert.ok(distributorFilenameScore('ALNOOR MEDICINE COMPANY.pdf', alNoor) >= 0.5);
  assert.ok(distributorFilenameScore('SS MEDICINE COMPANY.pdf', ss) >= 0.5);
});

test('does not auto-select when different distributors tie', () => {
  const kotAddu = { name: 'AL NOOR MEDICINE COMPANY', area: 'KOT ADDU' };
  const sadiqAbad = { name: 'Al Noor Medicine Company', area: 'Sadiq Abad' };

  assert.equal(bestByName('ALNOOR MEDICINE COMPANY.pdf', [kotAddu, sadiqAbad]), null);
  assert.equal(bestByName('Al Noor Medicine Company (Sadiq Abad).pdf', [kotAddu, sadiqAbad]), sadiqAbad);
});

test('treats exact duplicate records as one distributor', () => {
  const first = { name: 'AL-FATEH PHARMA', area: 'Mian Channu' };
  const duplicate = { name: 'AL-FATEH PHARMA', area: 'MIAN CHANNU' };

  assert.equal(bestByName('AL-FATEH PHARMA.pdf', [first, duplicate]), first);
});

test('does not find joined initials inside longer words', () => {
  const ma = { name: 'M.A PHARMA', area: 'OKARA' };
  const ng = { name: 'N & G ENTERPRISES', area: 'SAHIWAL' };

  assert.ok(distributorFilenameScore('makkah pharma.pdf', ma) < 0.5);
  assert.ok(distributorFilenameScore('Muhammad Pharma TR.pdf', ma) < 0.5);
  assert.ok(distributorFilenameScore('TIMMERGARA SHIFA ENTERPRISES CLOSING SSR.PDF', ng) < 0.5);
  assert.ok(distributorFilenameScore('MA PHARMA.pdf', ma) >= 0.5);
});

test('matches a whole name written without spaces', () => {
  assert.ok(distributorFilenameScore('PHARMA ZONE.pdf', { name: 'PHARMAZONE', area: 'D. G. KHAN' }) >= 0.5);
});

test('distinctive words outweigh generic trade words', () => {
  assert.ok(distributorFilenameScore('Chishti Pharma.pdf', { name: 'CHISHTI PHARMA DISTRIBUTOR', area: 'MULTAN' }) >= 0.5);
});

test('ignores a filename code that contradicts the named distributor', () => {
  const bacha = { name: 'Bacha Enterprises', area: 'Dargai' };
  const shehbaz = { name: 'SHEHBAZ MEDICINE COMPANY', area: 'SHEIKHUPURA' };

  assert.equal(chooseDistributor('1-1489-shehbaz sheikupura.pdf', [bacha], [bacha, shehbaz]), null);
  assert.equal(chooseDistributor('1-1489-report.pdf', [bacha], [bacha, shehbaz]), bacha);
  assert.equal(chooseDistributor('1-1489-Bacha Enterprises.pdf', [bacha], [bacha, shehbaz]), bacha);
});

test('normalizes Yaseen and Yasin spelling variants', () => {
  const yasin = { name: 'YASIN TRADERS', area: 'ABBOTTABAD' };
  const yaseen = { name: 'YASEEN TRADERS', area: 'MANSEHRA' };

  assert.equal(bestByName('Yasin Traders-Manshera.pdf', [yasin, yaseen]), yaseen);
});

test('whole-name matches must line up with filename words', () => {
  assert.ok(distributorFilenameScore('NISAR ENTERPRISES.pdf', { name: 'AR ENTERPRISES', area: 'MULTAN' }) < 0.5);
  assert.ok(distributorFilenameScore('INTIZAR DISTRIBUTOR auto.pdf', { name: 'AR DISTRIBUTORS', area: 'JEHLUM' }) < 0.5);
});

test('a city in the distributor name is not a distinctive match', () => {
  const premier = { name: 'PREMIER SALES (PVT) LTD. ISLAMABAD', area: 'ISLAMABAD' };
  const layyah = { name: 'PUNJAB MEDICINE LAYYAH', area: 'LAYYAH' };

  assert.ok(distributorFilenameScore('Pharma Net Islamabad.pdf', premier) < 0.5);
  assert.ok(distributorFilenameScore('layyah TRD.pdf', layyah) < 0.5);
  assert.ok(distributorFilenameScore('Punjab Medicine Layyah.pdf', layyah) >= 0.5);
});

test('expands TTS to Toba Tek Singh', () => {
  const gojra = { name: 'MUSHTAQ DISTRIBUTORS', area: 'GOJRA' };
  const tts = { name: 'MUSHTAQ DISTRIBUTOR T.T.SINGH', area: 'T.T.SINGH' };

  assert.equal(bestByName('MUSHTAQ DISTRIBUTORS TTS.pdf', [gojra, tts]), tts);
});

test('normalizes Ahmed and Ahmad filename spelling variants', () => {
  const distributor = { name: 'AHMAD MEDICOSE', area: null };

  assert.ok(distributorFilenameScore('AHMED MEDICOSE.pdf', distributor) >= 0.5);
});

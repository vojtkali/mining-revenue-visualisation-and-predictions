import importlib.util
import json
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('update','scripts/update_live.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)

class DataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot=json.loads(u.SOURCE.read_text())
    def test_complete_observations(self):
        db=u.validate(self.snapshot)
        self.assertEqual(len(db),4)
        for a in db:self.assertIn(self.snapshot['end'],db[a])
    def test_missing_day_fails(self):
        data={**self.snapshot,'data':self.snapshot['data'][1:]}
        with self.assertRaises(ValueError):u.validate(data)
    def test_missing_price_fails(self):
        data={**self.snapshot,'data':[{**self.snapshot['data'][0],'PriceUSD':''}]+self.snapshot['data'][1:]}
        with self.assertRaises(ValueError):u.validate(data)
    def test_snapshot_reproduces_published_datasets(self):
        for name,data in u.derive(self.snapshot).items():
            self.assertEqual(data,json.loads((u.DER/(name+'.json')).read_text()))
            self.assertTrue(all(r['e']==0 and r['source']=='coinmetrics' for r in data['rows']))
    def test_unit_equations(self):
        d=u.derive(self.snapshot)
        for r in d['zec']['rows']:self.assertAlmostEqual(r['hv'],r['mz']/(r['hr']*1e6)*r['z']/r['p'])
        for r in d['l9']['rows']:self.assertAlmostEqual(r['hv'],(r['ml']/(r['hl']*1e3)*r['l']+r['mg']/(r['hg']*1e3)*r['g'])/r['p'])
if __name__=='__main__':unittest.main()

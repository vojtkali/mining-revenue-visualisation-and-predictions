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
    def test_incomplete_last_day_is_left_for_later(self):
        end=self.snapshot['end']
        data=[{**r,'HashRate':''} if r['asset']=='doge' and r['time'][:10]==end else r for r in self.snapshot['data']]
        t=u.trim_to_complete({**self.snapshot,'data':data})
        self.assertLess(t['end'],end)
        self.assertTrue(all(r['time'][:10]<=t['end'] for r in t['data']))
        u.validate(t)
    def test_missing_asset_day_is_left_for_later(self):
        end=self.snapshot['end']
        data=[r for r in self.snapshot['data'] if not(r['asset']=='zec' and r['time'][:10]==end)]
        self.assertLess(u.trim_to_complete({**self.snapshot,'data':data})['end'],end)
    def test_long_lag_fails(self):
        import datetime as dt
        end=dt.date.fromisoformat(self.snapshot['end'])
        orig_download,orig_source=u.download,u.SOURCE
        u.download=lambda e:{**self.snapshot,'end':e}
        u.SOURCE=Path('/nonexistent/snapshot.json')
        class FD(dt.datetime):
            @classmethod
            def now(cls,tz=None):return dt.datetime.combine(end+dt.timedelta(days=u.MAX_LAG_DAYS+2),dt.time(),dt.timezone.utc)
        orig_dt=u.dt.datetime;u.dt.datetime=FD
        try:
            with self.assertRaises(SystemExit):u.main()
        finally:u.download,u.SOURCE,u.dt.datetime=orig_download,orig_source,orig_dt
if __name__=='__main__':unittest.main()

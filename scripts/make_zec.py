import csv, json, sys, re, datetime as dt
D=dt.date.fromisoformat
btc_csv, zec_csv, make_py, out, cmc_csv = sys.argv[1:6]
src=open(make_py).read()
PB=eval(re.search(r"^P=(\{.*?\})$",src,re.M).group(1))
HB={}  # unused
def interp(A,d):
    ks=sorted(A)
    for a,b in zip(ks,ks[1:]):
        if a<=d<=b:
            t=(D(d)-D(a)).days/max(1,(D(b)-D(a)).days); return A[a]+(A[b]-A[a])*t
START='2023-06-01'
btc={r['time']:float(r['PriceUSD']) for r in csv.DictReader(open(btc_csv)) if r['time']>=START and r['PriceUSD']}
zr=[r for r in csv.DictReader(open(zec_csv)) if r['time']>=START and r['HashRate']]
cmEnd=zr[-1]['time']; PB[cmEnd]=btc[cmEnd]
z={}
for r in zr:
    z[r['time']]=dict(z=float(r['PriceUSD']),h=float(r['HashRate']),mz=0.8*float(r['IssTotNtv'])+float(r['FeeTotNtv']))
ds=sorted(z)
def sm(k,i,n=7):
    xs=[z[ds[j]][k] for j in range(max(0,i-n+1),i+1)]; return sum(xs)/len(xs)
rows=[]
for i,d in enumerate(ds):
    rows.append(dict(d=d,p=round(btc[d],2),z=round(z[d]['z'],3),hr=round(sm('h',i),3),mz=round(sm('mz',i),2),e=0))
last=rows[-1]
mz_avg=sum(r['mz'] for r in rows[-30:])/30
# sparse public ZEC anchors (web search, Oct 2026) — very rough
PZ={cmEnd:last['z'],'2026-06-08':480,'2026-06-14':334,'2026-06-20':487,'2026-07-10':420,'2026-07-25':396,'2026-08-10':700,
    '2026-08-20':770,'2026-08-28':850,'2026-09-18':1492,'2026-09-27':1600,'2026-10-08':1110,'2026-10-12':1257,'2026-10-13':1250}
# network hashrate GS/s read off the user's 2Miners all-time chart (x 0.96 to match Coin Metrics level on overlap)
HZ={cmEnd:last['hr'],**{k:round(v*0.96,2) for k,v in {'2026-06-03':19.5,'2026-06-27':20.6,'2026-07-12':24.0,'2026-07-22':24.5,
    '2026-08-06':25.1,'2026-08-16':26.3,'2026-08-26':28.0,'2026-09-10':29.5,'2026-09-25':30.5,'2026-10-13':30.59}.items()}}
CMC={}
for line in open(cmc_csv,encoding='utf-8-sig').read().splitlines()[1:]:
    t,pr,_=line.split(';'); t=t.strip('"')
    # CMC row stamped D 02:00 = close of D-1; an intraday stamp (last row) is that day's live price
    k=t[:10] if not t.endswith('02:00:00') else (D(t[:10])-dt.timedelta(1)).isoformat()
    CMC[k]=float(pr)
ov=[(k,z[k]['z'],CMC[k]) for k in sorted(z) if k in CMC]
dev=[abs(a/b-1) for _,a,b in ov]; print('overlap days',len(ov),'median dev %.2f%%'%(100*sorted(dev)[len(dev)//2]))
PZ={**PZ,**{k:v for k,v in CMC.items() if k>cmEnd}}
d=D(cmEnd)+dt.timedelta(1)
while d<=D('2026-10-13'):
    s=d.isoformat()
    rows.append(dict(d=s,p=round(interp(PB,s),2),z=round(interp(PZ,s),3),hr=round(interp(HZ,s),3),mz=round(mz_avg,2),e=1)); d+=dt.timedelta(1)
for r in rows: r['hv']=round(r['mz']/(r['hr']*1e6)*r['z']/r['p'],12)   # BTC per kSol/s per day
json.dump(dict(cmEnd=cmEnd,rows=rows),open(out,'w'),separators=(',',':'))
for r in rows[::90]+[rows[-1]]:
    usd=r['hv']*840*r['p']; print(r['d'],'BTC',r['p'],'ZEC',r['z'],'GS',r['hr'],'Z15Pro $/day',round(usd,2),'sats/day',round(r['hv']*840*1e8),r['e'])

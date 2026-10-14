import csv, json, sys, re, datetime as dt
D=dt.date.fromisoformat
btc_csv, ltc_csv, doge_csv, make_py, out = sys.argv[1:6]
PB=eval(re.search(r"^P=(\{.*?\})$",open(make_py).read(),re.M).group(1))
def interp(A,d):
    ks=sorted(A)
    for a,b in zip(ks,ks[1:]):
        if a<=d<=b:
            t=(D(d)-D(a)).days/max(1,(D(b)-D(a)).days); return A[a]+(A[b]-A[a])*t
START='2024-05-01'
btc={r['time']:float(r['PriceUSD']) for r in csv.DictReader(open(btc_csv)) if r['time']>=START and r['PriceUSD']}
def load(f):
    o={}
    for r in csv.DictReader(open(f)):
        if r['time']>=START and r['HashRate'] and r['PriceUSD']:
            o[r['time']]=dict(pr=float(r['PriceUSD']),h=float(r['HashRate']),m=float(r['IssTotNtv'])+float(r['FeeTotNtv']))
    return o
L=load(ltc_csv); G=load(doge_csv)
ds=sorted(set(L)&set(G)&set(btc)); cmEnd=ds[-1]
def sm(src,k,i,n=7):
    xs=[src[ds[j]][k] for j in range(max(0,i-n+1),i+1)]; return sum(xs)/len(xs)
rows=[]
for i,d in enumerate(ds):
    rows.append(dict(d=d,p=round(btc[d],2),l=round(L[d]['pr'],3),g=round(G[d]['pr'],5),
                     hl=round(sm(L,'h',i),1),hg=round(sm(G,'h',i),1),ml=round(sm(L,'m',i),2),mg=round(sm(G,'m',i)),e=0))
last=rows[-1]; PB[cmEnd]=last['p']
ml_avg=sum(r['ml'] for r in rows[-30:])/30; mg_avg=sum(r['mg'] for r in rows[-30:])/30
# sparse public anchors after Coin Metrics ends (web search, Oct 2026) -- rough
PL={cmEnd:last['l'],'2026-06-02':50.71,'2026-07-15':47.0,'2026-08-05':44.0,'2026-09-27':70.93,'2026-10-13':61.34}
PG={cmEnd:last['g'],'2026-10-04':0.096,'2026-10-08':0.081,'2026-10-13':0.0844}
HL={cmEnd:last['hl'],'2026-10-13':2440.0}
ratio=last['hg']/last['hl']
d=D(cmEnd)+dt.timedelta(1)
while d<=D('2026-10-13'):
    s=d.isoformat(); hl=interp(HL,s)
    rows.append(dict(d=s,p=round(interp(PB,s),2),l=round(interp(PL,s),3),g=round(interp(PG,s),5),hl=round(hl,1),hg=round(hl*ratio,1),ml=round(ml_avg,2),mg=round(mg_avg),e=1)); d+=dt.timedelta(1)
for r in rows:
    # BTC per GH/s per day; hashrates are TH/s, 1 GH/s = 1e-3 TH/s
    r['hv']=round((r['ml']/(r['hl']*1e3)*r['l'] + r['mg']/(r['hg']*1e3)*r['g'])/r['p'],12)
    r['sd']=round(r['mg']/(r['hg'])*r['g']/(r['ml']/r['hl']*r['l']+r['mg']/r['hg']*r['g']),4)   # DOGE share of revenue
json.dump(dict(cmEnd=cmEnd,rows=rows),open(out,'w'),separators=(',',':'))
for r in rows[::120]+[rows[-1]]:
    usd=r['hv']*16.2*r['p']; print(r['d'],'BTC',r['p'],'LTC',r['l'],'DOGE',r['g'],'hrL',r['hl'],'L9 $/day',round(usd,2),'DOGE share',r['sd'],r['e'])

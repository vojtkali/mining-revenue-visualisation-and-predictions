import csv, json, sys, datetime as dt
src=sys.argv[1]; out=sys.argv[2]
D=dt.date.fromisoformat
rows=[r for r in csv.DictReader(open(src)) if r['time']>='2024-06-01' and r['HashRate']]
cm={}
for r in rows:
    cm[r['time']]=dict(p=float(r['PriceUSD']),h=float(r['HashRate']),rew=float(r['IssTotNtv'])+float(r['FeeTotNtv']))
dates=sorted(cm)
# 7-day trailing mean of hashrate & reward (daily estimates are noisy)
def sm(key,i,n=7):
    xs=[cm[dates[j]][key] for j in range(max(0,i-n+1),i+1)]; return sum(xs)/len(xs)
data=[]
for i,d in enumerate(dates):
    h=sm('h',i); rew=sm('rew',i)
    data.append(dict(d=d,p=round(cm[d]['p'],2),hr=round(h/1e6,1),hv=rew/h,e=0))
last=data[-1]
avg_fee=sum(float(r['FeeTotNtv']) for r in rows[-30:])/30/144
rew_day=144*(3.125+avg_fee)
# sparse public anchors after Coin Metrics ends (web search, Oct 2026)
P={'2026-05-24':77095,'2026-05-26':74606,'2026-05-29':73776,'2026-05-30':72946,'2026-06-01':66584,'2026-06-03':62711,'2026-06-05':61051,'2026-06-07':63264,'2026-06-09':61604,'2026-06-12':63541,'2026-06-13':65201,'2026-06-15':66307,'2026-06-18':62988,'2026-06-20':64371,'2026-06-22':64371,'2026-06-24':59945,'2026-06-28':59391,'2026-06-30':58008,'2026-07-02':62711,'2026-07-06':64205,'2026-07-10':62158,'2026-07-14':64924,'2026-07-16':63817,'2026-07-20':66584,'2026-07-24':64371,'2026-07-28':63541,'2026-07-31':62988,'2026-08-05':64813,'2026-08-08':64924,'2026-08-12':63541,'2026-08-16':62988,'2026-08-17':64647,'2026-08-20':78755,'2026-08-21':77649,'2026-08-24':78755,'2026-08-27':80968,'2026-08-28':77649,'2026-08-30':77649,'2026-09-02':80968,'2026-09-05':80138,'2026-09-07':77372,'2026-09-10':76266,'2026-09-13':77372,'2026-09-15':75436,'2026-09-17':76542,'2026-09-19':81245,'2026-09-21':86777,'2026-09-23':84564,'2026-09-26':84288,'2026-09-29':83458,'2026-10-01':84841,'2026-10-04':86777,'2026-10-05':85671,'2026-10-08':81798,'2026-10-09':82905,'2026-10-11':84011,'2026-10-13':83231}
H={'2026-06-05':894,'2026-07-15':900,'2026-08-08':912,'2026-08-15':930,'2026-09-06':934,'2026-09-20':920,'2026-10-13':1000}
P[last['d']]=last['p']; H[last['d']]=last['hr']
def interp(A,d):
    ks=sorted(A); 
    for a,b in zip(ks,ks[1:]):
        if a<=d<=b:
            t=(D(d)-D(a)).days/max(1,(D(b)-D(a)).days); return A[a]+(A[b]-A[a])*t
d=D(last['d'])+dt.timedelta(1)
while d<=D('2026-10-13'):
    s=d.isoformat(); p=interp(P,s); h=interp(H,s)
    data.append(dict(d=s,p=round(p,2),hr=round(h,1),hv=rew_day/(h*1e6),e=1)); d+=dt.timedelta(1)
for x in data: x['hv']=round(x['hv'],10)
json.dump(dict(cmEnd=last['d'],rows=data),open(out,'w'),separators=(',',':'))
for x in data[::60]+[data[-1]]: print(x['d'],x['p'],x['hr'],round(x['hv']*x['p']*1000,2),'$/PH/d',x['e'])

import sys,re,html
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s): super().__init__(); s.out=[]; s.skip=0; s.cur=[]
    def handle_starttag(s,t,a):
        if t in('script','style','noscript'): s.skip+=1
        if t in('p','h1','h2','h3','li'): s.cur=[]
    def handle_endtag(s,t):
        if t in('script','style','noscript'): s.skip-=1
        if t in('p','h1','h2','h3','li'):
            x=' '.join(''.join(s.cur).split())
            if len(x)>60: s.out.append(x)
            s.cur=[]
    def handle_data(s,d):
        if not s.skip: s.cur.append(d)
p=P(); p.feed(open(sys.argv[1],encoding='utf-8',errors='ignore').read())
for i,x in enumerate(p.out): print(i,x)

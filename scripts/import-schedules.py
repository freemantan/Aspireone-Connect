"""Read-only source extraction; insert-only, reproducible schedule database seed.

Run with bundled Python (openpyxl, pypdf, pdfplumber).
Never connects to production. Outputs SQLite plus a Supabase transaction.
"""
from pathlib import Path
import argparse, collections, datetime as dt, hashlib, json, re, sqlite3
import openpyxl
from pypdf import PdfReader

DAY=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
TIME=re.compile(r'(?<!\d)(\d{1,4}(?:[.:]\d{2})?)\s*(am|pm)?\s*[-–—]\s*(\d{1,4}(?:[.:]\d{2})?)\s*(am|pm)\b',re.I)
SUBJECT=re.compile(r'English|Math(?:ematics)?|Science|Chemistry|Physics|Biology|Chinese|General Paper|\bGP\b|\bPOA\b|Econs|Economics|Account|Geography|Social Studies|Humanities',re.I)
CONFIG={
 'AV':('2027 AV Term 1 Schedule.xlsx',['P1-2','P3-4','P5-6','S1-2','S3-5','IPIB Y3-4','JC']),
 'BM':('2027 Term Schedule (BM) - Master.xlsx',['MP','UP','LS','US','JC','CL']),
 'BT':('2027 Term 1 Student Schedule.xlsx',['Pri 3','Pri 4','Pri 5','Pri 6','Sec 1','Sec 2','Sec 3','Sec 4','IPIBY3Y4','JCIPIB']),
 'HM':('2027 Term Schedule (HM) - Master.xlsx',['UP','MP','LS','US','IP Yr3-4','JCIP Yr 5-6','MP - CL','UP - CL','LS - CL','US - CL']),
 'JP':('JP 2027 T1 Students Schedule - Copy.xlsx',['P4 ','P5','P6 ','S1S2','Sec 3','Sec 4','IPIB Y1-2','IPIB Y3-4','IPIB Y5-6&JC1-2']),
 'LM':('2027 Schedule (LM).xlsx',['LP','MP','UP','LS','US','JC','2027 CL']),
 'NEX':('2027 Term Student Schedule.xlsx',['Pri 1-2','Pri 3','Pri 4','Pri 5','Pri 6','Sec 1','Sec 2','Sec 3','Sec 4','JCIPIB','IPIBY1Y2','IPIBY3Y4']),
 'PW':('2027 Term Schedule (PW) - Master.xlsx',['2027 Term 1 Lower Primary','2027 Term 1  Middle Primary','2027 Term 1  Upper Primary',' 2027 Term 1 Lower Secondary - ','2027 Term 1 Upper Secondary - E','2027 Term 1 Year 3&Year4 - EMS','2027 Term 1 JC - EMS']),
 'RM':('2027 Term Schedule (RM) - T1.xlsx',['MP UP','LS','US']),
 'SM':('2027 Term Schedule (SM) - T1 2027.xlsx',['LP','MP','UP','LS','US','IP (Y3-Y4)','JC',' CL']),
 'US':('2027 Term Schedule (US) - T1 2027.xlsx',['MP','UP','LS','US','JC','CL']),
 'WL':('2027 Term Schedule (WL) - Master.xlsx',['2027 - EMS Lower Pri','2027 - EMS Middle Pri','2027 - EMS Upper Pri','2027 - EMS Lower Sec','2027 - EMS Upper Sec','2027 - Y3Y4','2027 - JC','2027 Template - CL']),
 'WM':('2027 Term Schedule (WM) - Master.xlsx',['MP','UP','LS','US','IP','JC','2027 Template - CL'])}
BRANCHES=[('AV','Alexandra Village','Central'),('RM','Rochester Mall','Central'),('BT','Bukit Timah','Central'),('US','Novena Thomson','Central'),('PLQ','Paya Lebar Quarter','East'),('BM','Bedok Mall','East'),('PW','Parkway Parade','East'),('JP','Jurong Point','West'),('WM','West Mall','West'),('HM','Hillion Mall','West'),('NEX','Nex','North East'),('WL','Woodleigh Mall','North East'),('SM','Seletar Mall','North East'),('KV','Kovan','North East'),('LM','Lentor Modern','North')]
NOVENA_MIGRATION="""
update ao_schedule_branches set name='Novena Thomson',zone_id='central' where id='US';
update ao_schedule_issues set resolved=1 where (branch_id='US' and code='zone_unassigned') or (branch_id='NT' and code in ('schedule_not_supplied','missing_contact','missing_qr_destination'));
update ao_schedule_sources set branch_id='US' where branch_id='NT';
update ao_schedule_sessions set branch_id='US' where branch_id='NT';
update ao_schedule_calendar_notes set branch_id='US' where branch_id='NT';
update ao_schedule_issues set branch_id='US' where branch_id='NT';
delete from ao_schedule_branches where id='NT';
"""
def jid(*v): return hashlib.sha256('|'.join(map(str,v)).encode()).hexdigest()[:32]
def js(v): return json.dumps(v,ensure_ascii=False,default=str,separators=(',',':'))
def txt(v): return '' if v is None else str(v).strip()
def minutes(v,mer):
 v=v.replace('.',':')
 if ':' in v:h,m=map(int,v.split(':'))
 elif len(v)>2:h,m=int(v[:-2]),int(v[-2:])
 else:h,m=int(v),0
 if not 1<=h<=12 or not 0<=m<60:raise ValueError('Invalid clock time')
 return h%12*60+m+(720 if mer.lower()=='pm' else 0)
def clock(match):
 a,am,b,bm=match.groups(); issues=[]
 try:
  end=minutes(b,bm)
  if am:start=minutes(a,am)
  else:
   options=[minutes(a,m) for m in ['am','pm']]
   valid=[v for v in options if 0<end-v<=240]
   start=valid[0] if len(valid)==1 else None
   issues.append('inferred_meridiem' if start is not None else 'ambiguous_meridiem')
  if start is None or not 0<end-start<=240: return None,None,issues+['invalid_time_range']
  return start,end,issues
 except ValueError:return None,None,['invalid_clock_time']
def subject(v):
 v=re.split(r'(?:Class )?(?:conducted by|Conducted by)',v,flags=re.I)[0].strip()
 if not SUBJECT.search(v):return None
 return re.sub(r'\s+',' ',v)
def slot_coach(header,segment):
 aliases={}
 for name,code in re.findall(r'Coach\s*([^,;(]+?)\s*\(\s*([A-Za-z ]+)\s*\)',header,re.I):aliases[code.strip().upper()]=name.strip()
 m=re.match(r'\s*\(\s*([A-Za-z ]+)\s*\)',segment)
 if m and m[1].strip().upper() in aliases:return 'Coach '+aliases[m[1].strip().upper()],[]
 if m and len(m[1].strip())<=4 and m[1].upper() not in ['PURE','COMB','HCL']:
  return header,['coach_code_requires_review']
 return header,[]
def level_label(sheet,top):
 for v in top:
  if re.search(r'Primary|Secondary|College|IP.?IB|Integrated Programme|^IP |^JC',v,re.I) and not re.search(r'Contact|Road|Class conducted',v):return v
 return sheet
def level_codes(label):
 s=label.upper(); out=[]
 for prefix,pattern in [('P',r'(?:PRIMARY|PRI|\bP)\s*([1-6])(?:\s*[-–&/]\s*(?:P)?([1-6]))?'),('S',r'(?:SECONDARY|SEC|\bS)\s*([1-5])(?:\s*[-–&/]\s*(?:S)?([1-5]))?')]:
  for m in re.finditer(pattern,s):out.extend(prefix+str(n) for n in range(int(m[1]),int(m[2] or m[1])+1))
 if 'LOWER PRI' in s or s=='LP':out+=['P1','P2']
 if 'MIDDLE PRI' in s or s=='MP':out+=['P3','P4']
 if 'UPPER PRI' in s or s=='UP':out+=['P5','P6']
 if 'LOWER SEC' in s or s=='LS':out+=['S1','S2']
 if 'UPPER SEC' in s or s=='US':out+=['S3','S4','S5']
 if 'JC' in s or 'COLLEGE' in s:out+=['JC1','JC2']
 if 'IP' in s or 'IB' in s:
  for m in re.finditer(r'(?:Y(?:EAR)?R?\s*|IPIB)([1-6])\s*[-–&/]\s*(?:(?:IP|IB)\s*)?(?:Y(?:EAR)?R?\s*)?([1-6])',s):
   for n in range(int(m[1]),int(m[2])+1):
    if 'IP' in s:out.append('IPY'+str(n))
    if 'IB' in s:out.append('IBY'+str(n))
 return sorted(set(out))

SCHEMA='''
create table if not exists ao_schedule_zones(id text primary key,name text not null unique);
create table if not exists ao_schedule_branches(id text primary key,name text not null,zone_id text references ao_schedule_zones(id),phone text,whatsapp text,email text,address text,contact_url text,qr_url text,contact_evidence text not null,publication_status text not null default 'draft',revision integer not null default 1);
create table if not exists ao_schedule_sources(id text primary key,branch_id text references ao_schedule_branches(id),relative_path text not null,sha256 text not null,kind text not null,extraction_method text not null,content text not null,metadata text not null,unique(relative_path,sha256));
create table if not exists ao_schedule_sheets(id text primary key,source_id text not null references ao_schedule_sources(id),name text not null,role text not null,cells text not null);
create table if not exists ao_schedule_sessions(id text primary key,branch_id text not null references ao_schedule_branches(id),academic_year integer not null,term integer not null,level_label text not null,levels text not null,subject text not null,day integer check(day between 1 and 7),start_minute integer,end_minute integer,raw_time text not null,coach text,format text not null,delivery_mode text not null,effective_from text,effective_to text,status text not null check(status in ('draft','published','discontinued')),review_state text not null,notes text not null,revision integer not null default 1,check((start_minute is null and end_minute is null) or (start_minute>=0 and end_minute<=1440 and end_minute>start_minute)));
create index if not exists ao_schedule_filter on ao_schedule_sessions(branch_id,academic_year,term,status,subject);
create table if not exists ao_schedule_evidence(id text primary key,session_id text not null references ao_schedule_sessions(id),source_id text not null references ao_schedule_sources(id),sheet text,locator text not null,raw_value text not null,raw_context text not null);
create table if not exists ao_schedule_calendar_notes(id text primary key,branch_id text not null references ao_schedule_branches(id),source_id text not null references ao_schedule_sources(id),sheet text not null,locator text not null,source_date text,note text not null,review_state text not null);
create table if not exists ao_schedule_issues(id text primary key,branch_id text references ao_schedule_branches(id),session_id text references ao_schedule_sessions(id),source_id text references ao_schedule_sources(id),code text not null,detail text not null,resolved integer not null default 0);
create table if not exists ao_schedule_audit(id text primary key,session_id text not null references ao_schedule_sessions(id),actor text not null,at text not null,before_data text,after_data text not null);
create table if not exists ao_schedule_imports(id text primary key,imported_at text not null,summary text not null);
create table if not exists ao_schedule_subjects(id text primary key,name text not null unique);
create table if not exists ao_schedule_levels(id text primary key,name text not null unique);
create table if not exists ao_schedule_session_subjects(id text primary key,session_id text not null references ao_schedule_sessions(id),subject_id text not null references ao_schedule_subjects(id),unique(session_id,subject_id));
create table if not exists ao_schedule_session_levels(id text primary key,session_id text not null references ao_schedule_sessions(id),level_id text not null references ao_schedule_levels(id),unique(session_id,level_id));
create table if not exists ao_schedule_import_coverage(id text primary key,source_id text not null references ao_schedule_sources(id),sheet text not null,locator text not null,expected_slots integer not null,imported_slots integer not null,raw_value text not null);
'''

class Importer:
 def __init__(self,root,out,cache=None):
  self.root=root;self.out=out;out.mkdir(parents=True,exist_ok=True)
  self.db=sqlite3.connect(out/'aspire-class-schedules.sqlite');self.db.execute('pragma foreign_keys=on');self.db.executescript(SCHEMA)
  self.rows=collections.defaultdict(list);self.source_ids={};self.sources={};self.workbooks={};self.counts=collections.Counter();self.cache=cache
 def insert(self,table,**row):
  self.rows[table].append(row)
  self.db.execute('insert into '+table+'('+','.join(row)+') values ('+','.join('?' for _ in row)+') on conflict do nothing',list(row.values()))
 def issue(self,branch,code,detail,session=None,source=None):
  self.insert('ao_schedule_issues',id=jid(branch,code,detail,session,source),branch_id=branch,session_id=session,source_id=source,code=code,detail=detail)
 def inventory(self):
  for name in ['Central','East','West','North East','North']:self.insert('ao_schedule_zones',id=name.lower().replace(' ','-'),name=name)
  for code,name,zone in BRANCHES:self.insert('ao_schedule_branches',id=code,name=name,zone_id=zone.lower().replace(' ','-') if zone else None,contact_evidence='[]')
  self.db.executescript(NOVENA_MIGRATION)
  cached={}
  if self.cache and (self.cache/'index.json').exists():cached={x['path']:x for x in json.loads((self.cache/'index.json').read_text())}
  for p in sorted(self.root.rglob('*')):
   if not p.is_file() or p.suffix.lower() not in ['.xlsx','.pdf']:continue
   rel=str(p.relative_to(self.root));code=re.match(r'\(([^)]+)\)',rel)[1];digest=hashlib.sha256(p.read_bytes()).hexdigest();sid=jid(rel,digest)
   kind='pricing' if any(k in rel.lower() for k in ['price','pricing','fees']) else 'calendar' if 'calendar' in p.name.lower() else 'attendance' if 'attendance' in p.name.lower() else 'schedule'
   meta={};content='';method='xlsx-cells'
   if p.suffix.lower()=='.pdf':
    r=PdfReader(p);meta['pages']=len(r.pages);links=[]
    for i,page in enumerate(r.pages):
     for annot in page.get('/Annots',[]):
      obj=annot.get_object();a=obj.get('/A',{});url=a.get('/URI')
      if url:links.append({'page':i+1,'url':str(url)})
    meta['links']=links
    item=cached.get(rel)
    if item and item['hash']==digest:
     content=(self.cache/item['textfile']).read_text();method='ocr' if item.get('chars',100)>0 and item.get('chars',100)<50 else 'pdf-text'
    else:
     content='\n'.join(f'PAGE {i+1}\n'+(pg.extract_text(extraction_mode='layout') or '') for i,pg in enumerate(r.pages));method='pdf-text'
    if len(content.strip())<30:self.issue(code,'extraction_required','Image PDF requires OCR: '+rel,source=None)
   else:
    w=openpyxl.load_workbook(p,data_only=False);self.workbooks[rel]=w
    meta['sheets']=[{'name':s.title,'state':s.sheet_state} for s in w]
   self.source_ids[rel]=sid;self.sources[rel]={'path':p,'branch':code,'content':content,'kind':kind,'metadata':meta}
   self.insert('ao_schedule_sources',id=sid,branch_id=code,relative_path=rel,sha256=digest,kind=kind,extraction_method=method,content=content,metadata=js(meta))
   if p.suffix.lower()=='.xlsx':
    for s in self.workbooks[rel]:
     selected=code in CONFIG and p.name==CONFIG[code][0] and s.title in CONFIG[code][1]
     private=kind=='attendance' or p.name=='WL 2027 Calendar.xlsx' and s.title!='class schedule'
     role='private-roster-excluded' if private else 'primary-schedule' if selected else 'supporting-calendar' if 'calendar' in s.title.lower() else 'alternate-or-template'
     cells=[] if private else [{'cell':c.coordinate,'value':c.value,'type':c.data_type,'format':c.number_format,'comment':c.comment.text if c.comment else None} for row in s for c in row if c.value is not None]
     self.insert('ao_schedule_sheets',id=jid(sid,s.title),source_id=sid,name=s.title,role=role,cells=js(cells))
   self.counts['source_files']+=1
 def add_session(self,branch,rel,sheet,loc,level,sub,day,raw,coach,mode='unspecified',fmt='unspecified',context='',match=None,extra=None,levels_override=None):
  sid=self.source_ids[rel];start,end,flags=clock(match) if match else (None,None,['enquiry_only'])
  levels=levels_override if levels_override is not None else level_codes(level)
  flags+=extra or []
  if not levels:flags.append('level_requires_review')
  if coach and len(re.findall(r'Coach\s*',coach,re.I))>1:flags.append('coach_not_assigned_to_slot')
  rid=jid(branch,rel,sheet,loc,match.start() if match else 'enquire')
  notes={'source_level':level,'source_context':context,'flags':sorted(set(flags)),'time_zone':'Asia/Singapore','term_dates_require_confirmation':True}
  self.insert('ao_schedule_sessions',id=rid,branch_id=branch,academic_year=2027,term=1,level_label=level,levels=js(levels),subject=sub,day=day,start_minute=start,end_minute=end,raw_time=raw,coach=None,format=fmt,delivery_mode=mode,effective_from=None,effective_to=None,status='draft',review_state='needs_review' if flags else 'imported',notes=js(notes))
  self.insert('ao_schedule_evidence',id=jid(rid,sid,loc),session_id=rid,source_id=sid,sheet=sheet,locator=loc,raw_value=raw,raw_context=context)
  for flag in set(flags):self.issue(branch,flag,f'{sheet}!{loc}: {raw}',rid,sid)
  return rid
 def workbook_sessions(self):
  for rel,w in self.workbooks.items():
   b=self.sources[rel]['branch']
   if b not in CONFIG or Path(rel).name!=CONFIG[b][0]:continue
   for sn in CONFIG[b][1]:
    s=w[sn];top=[txt(c.value) for row in s.iter_rows(min_row=1,max_row=5) for c in row if c.value is not None];label=level_label(sn,top)
    is_cl=bool(re.search(r'Chinese Language Class Schedule',label,re.I)) or 'CL' in sn
    if b=='JP' and sn.startswith('IPIB'):label=sn
    for row in s:
     days=[(c.column,DAY.index(txt(c.value).title())+1) for c in row if txt(c.value).title() in DAY]
     if len(days)!=7:continue
     r=row[0].row
     # Stop at the calendar, including an unlabeled date grid.
     above=' '.join(txt(s.cell(r-1,c).value) for c in range(1,s.max_column+1))
     if re.search(r'Calendar|Term\s*[1-4]\s*20\d\d',above,re.I) or any(isinstance(s.cell(r+1,c).value,(dt.datetime,dt.date)) for c,_ in days):break
     headers=[txt(s.cell(r-1,c).value) for c in range(1,s.max_column+1) if s.cell(r-1,c).value is not None]
     rawsub=next((v for v in headers if subject(v) and not re.search('conducted by',v,re.I)),None)
     blocklevel=next((v for v in headers if re.match(r'^(Primary|Secondary)\s*\d',v,re.I)),label) if is_cl else label
     sub='Chinese' if is_cl else subject(rawsub or '')
     coach='; '.join(v for v in headers if re.search('conducted by',v,re.I))
     next_headers=[rr for rr in range(r+1,min(s.max_row,r+7)+1) if sum(txt(s.cell(rr,c).value).title() in DAY for c in range(1,s.max_column+1))>=7]
     stop=min(next_headers)-1 if next_headers else min(r+3,s.max_row)
     for rr in range(r+1,stop+1):
      for col,day in days:
       c=s.cell(rr,col);raw=txt(c.value)
       if not raw or raw=='NO CLASS':continue
       if re.search('Calendar|Management reserves|Disclaimer',raw,re.I):continue
       matches=list(TIME.finditer(raw))
       if not matches and re.search(r'enquire|check with|TBC',raw,re.I):
        if sub:self.add_session(b,rel,sn,c.coordinate,blocklevel,sub,day,raw,coach,context=above)
       for i,m in enumerate(matches):
        segment=raw[m.end():matches[i+1].start() if i+1<len(matches) else len(raw)]
        # A label after several times applies to the preceding group of times.
        following=raw[m.end():]
        embedded_sub=next((subject(l) for l in following.splitlines() if subject(l) and 'Coach' not in l),None)
        embedded_coach=next((l.strip() for l in following.splitlines() if re.search(r'\bCoach\b',l)),None)
        chosen=embedded_sub or sub or 'Unspecified subject'
        extra=[] if chosen!='Unspecified subject' else ['subject_requires_review']
        if b=='JP' and not rawsub and not embedded_sub:extra+=['subject_requires_review']
        mode='online' if 'ONLINE' in raw.upper() or re.search(r'\(ONLINE\)',rawsub or '',re.I) else 'unspecified'
        if not embedded_coach and coach and re.search(r'\([A-Z][A-Za-z ]*\)',raw):extra+=['coach_code_requires_review']
        assigned,coach_flags=slot_coach(embedded_coach or coach,segment)
        extra=[e for e in extra if e!='coach_code_requires_review']+coach_flags
        restriction=level_codes(segment) if re.search(r'\b(?:P[1-6]|Sec(?:ondary)?\s*[1-5]|JC[12])\b',segment,re.I) else []
        if re.search(r'\bJ[12]\b',segment):restriction=['JC'+x for x in re.findall(r'\bJ([12])\b',segment)]
        self.add_session(b,rel,sn,c.coordinate,blocklevel,chosen,day,raw,assigned,mode,context=above+'\n'+raw,match=m,extra=extra,levels_override=restriction or None)
    # Account for every clock-range token in the active timetable region.
    cutoff=next((row[0].row for row in s if any(re.search(r'Calendar|^Term\s*[1-4]\s*20\d\d',txt(c.value),re.I) for c in row)),s.max_row+1)
    for row in s.iter_rows(max_row=cutoff-1):
     for c in row:
      raw=txt(c.value);expected=len(list(TIME.finditer(raw)))
      if not expected:continue
      imported=self.db.execute('select count(*) from ao_schedule_evidence where source_id=? and sheet=? and locator=?',(self.source_ids[rel],sn,c.coordinate)).fetchone()[0]
      self.insert('ao_schedule_import_coverage',id=jid(rel,sn,c.coordinate),source_id=self.source_ids[rel],sheet=sn,locator=c.coordinate,expected_slots=expected,imported_slots=imported,raw_value=raw)
      if expected!=imported:self.issue(b,'unparsed_time_cell',f'{sn}!{c.coordinate}: expected {expected}, imported {imported}. Raw: {raw}',source=self.source_ids[rel])
    # Calendar notes are evidence only: no automatic dated occurrences from unverified dates.
    for row in s:
     for c in row:
      if isinstance(c.value,(dt.date,dt.datetime)):
       note=txt(s.cell(c.row+1,c.column).value)
       if note and not isinstance(s.cell(c.row+1,c.column).value,(dt.date,dt.datetime)):
        self.insert('ao_schedule_calendar_notes',id=jid(rel,sn,c.coordinate,note),branch_id=b,source_id=self.source_ids[rel],sheet=sn,locator=c.coordinate,source_date=c.value.isoformat()[:10],note=note,review_state='needs_review')
       if c.value.year not in (2026,2027,2028):self.issue(b,'historical_calendar',sn+' contains '+str(c.value.year),source=self.source_ids[rel])
    if b=='AV':self.issue(b,'calendar_year_conflict',sn+': dates in the 2027 term calendar contain 2026 January–March dates.',source=self.source_ids[rel])
 def pdf_supplements(self):
  # NEX workbook ONLINE/LECTURE tabs contain copied coaching grids; use the dedicated PDFs.
  # Lentor has an IP PDF but no separate IP tab. Keep its explicit curriculum eligibility.
  targets=[r for r in self.sources if Path(r).name in ['online class.pdf','lecture class.pdf','Term 1 2027 Schedule (LM - IB IP Y3-Y4).pdf']]
  import pdfplumber
  for rel in targets:
   b=self.sources[rel]['branch'];mode='online' if Path(rel).name=='online class.pdf' else 'unspecified';fmt='lecture' if Path(rel).name=='lecture class.pdf' else 'unspecified'
   pdf=pdfplumber.open(self.sources[rel]['path'])
   for pn,page in enumerate(pdf.pages):
    lines=page.extract_text_lines(layout=False);sub=None;coach='';days=None
    for line in lines:
     t=line['text'];words=line.get('chars',[])
     if re.search(r'Term 1.*Calendar|^Term 1 2027',t,re.I):break
     if all(d in t for d in DAY):
      ws=[w for w in page.extract_words() if abs(w['top']-line['top'])<3 and w['text'] in DAY]
      if len(ws)==7:
       centers=[(w['x0']+w['x1'])/2 for w in ws];days=[(centers[i]+centers[i+1])/2 for i in range(6)]
      continue
     if SUBJECT.search(t) and not TIME.search(t) and not re.match(r'^\(',t):
      if re.search(r'Conducted by',t,re.I):
       spl=re.split(r'Conducted by',t,flags=re.I);sub=subject(spl[0]);coach='Conducted by '+spl[1]
      elif len(t)<100:sub=subject(t)
     if not sub or days is None:continue
     # Extract each day column as a block to preserve wrapped times and level annotations.
     if TIME.search(t) or re.search(r'\d(?:am|pm)?\s*-\s*$',t,re.I):
      # Handled once per subject block below, not per physical line.
      pass
    # Use header bounds rather than line order: long table cells wrap over multiple lines.
    headers=[l for l in lines if all(d in l['text'] for d in DAY)]
    for hi,h in enumerate(headers):
     if any(re.search(r'Term 1.*Calendar|^Term 1 2027',l['text'],re.I) and l['top']<h['top'] for l in lines):break
     ws=sorted([w for w in page.extract_words() if abs(w['top']-h['top'])<3 and w['text'] in DAY],key=lambda w:w['x0'])
     if len(ws)!=7:continue
     prev=[l for l in lines if l['bottom']<=h['top'] and SUBJECT.search(l['text']) and 'Education' not in l['text']]
     if not prev:continue
     heading=prev[-1]['text'];parts=re.split('Conducted by',heading,flags=re.I);sub=subject(parts[0])
     if not sub:continue
     coach='Conducted by '+parts[1] if len(parts)>1 else ''
     stop=headers[hi+1]['top']-18 if hi+1<len(headers) else page.height
     stops=[l['top'] for l in lines if l['top']>h['bottom'] and re.search(r'Term 1.*Calendar|^Term 1 2027|Management reserves',l['text'],re.I)]
     if stops:stop=min(stop,min(stops))
     centers=[(w['x0']+w['x1'])/2 for w in ws];edges=[0]+[(centers[i]+centers[i+1])/2 for i in range(6)]+[page.width]
     for i in range(7):
      raw=page.crop((edges[i],h['bottom']+1,edges[i+1],max(h['bottom']+2,stop))).extract_text() or ''
      ms=list(TIME.finditer(raw))
      for j,m in enumerate(ms):
       tail=raw[m.end():ms[j+1].start() if j+1<len(ms) else len(raw)]
       label='IP IB Y3-4' if b=='LM' else tail.strip() or 'Unspecified level'
       extra=['pdf_supplement_requires_review']
       self.add_session(b,rel,None,f'page {pn+1}, {sub}, {DAY[i]}, slot {j+1}',label,sub,i+1,raw,coach,mode,fmt,heading,match=m,extra=extra)
   pdf.close()
 def contacts(self):
  for code,name,zone in BRANCHES:
   primary=[(r,s) for r,s in self.sources.items() if s['branch']==code and s['kind']=='schedule']
   evidence=[];phone=None;wa=None;email=None;address=None;urls=[]
   for rel,s in primary:
    content=s['content']
    if rel in self.workbooks:
     content='\n'.join(txt(c.value) for sh in self.workbooks[rel] if sh.title in CONFIG.get(code,('',[]))[1] for row in sh.iter_rows(min_row=1,max_row=5) for c in row if c.value is not None)
    m=re.search(r'(?:Contact Us:|PHONE\s*#\s*:|Phone Numbers:|Call Us:)\s*([^\n]+)',content,re.I)
    if m:
     line=m[0];nums=re.findall(r'(?<!\d)[689]\d{3}\s?\d{4}(?!\d)',line)
     wm=re.search(r'(?:WHATSAPP(?:/SMS)?\s*:\s*([689]\d{3}\s?\d{4})|([689]\d{3}\s?\d{4})\s*\(WhatsApp\))',line,re.I)
     em=re.search(r'[\w.-]+@[\w.-]+\.[a-z]+',line,re.I)
     if wm and not wa:wa=(wm[1] or wm[2]).replace(' ','')
     if nums and not phone:phone=next((n.replace(' ','') for n in nums if n.replace(' ','')!=wa),nums[0].replace(' ',''))
     if em and not email:email=em[0]
     evidence.append({'source_id':self.source_ids[rel],'text':line})
    for l in s['metadata'].get('links',[]):
     if re.search(r'wa.me|whatsapp',l['url'],re.I):urls.append(l['url'])
   url=urls[0] if urls else 'https://wa.me/65'+wa if wa else 'tel:+65'+phone if phone else None
   # Initial contact fill only; a rerun must not replace a CRE's correction.
   self.db.execute('update ao_schedule_branches set phone=coalesce(phone,?),whatsapp=coalesce(whatsapp,?),email=coalesce(email,?),contact_url=coalesce(contact_url,?),contact_evidence=case when contact_evidence=\'[]\' then ? else contact_evidence end where id=?',(phone,wa,email,url,js(evidence),code))
   row=self.rows['ao_schedule_branches'][[b[0] for b in BRANCHES].index(code)];row.update(phone=phone,whatsapp=wa,email=email,contact_url=url,contact_evidence=js(evidence))
   if not phone:self.issue(code,'missing_contact','Verified branch phone number was not found in schedule sources.')
   if not url:self.issue(code,'missing_qr_destination','No verified WhatsApp destination found. QR destination remains empty.')
   if code in ['KV','PLQ']:self.issue(code,'schedule_not_supplied','Class Schedule Not Available. Please contact us.')
 def review(self):
  self.db.execute("update ao_schedule_issues set resolved=1 where code='possible_duplicate'")
  for b in CONFIG:
   self.issue(b,'publication_review','Imported as draft. Confirm source version, term validity and shared coaching semantics before publishing.')
  for b,code,detail in [('NEX','term_expiry_conflict','Schedule expiry says 14 March; price lists say term ends 21 March 2027.'),('NEX','source_version_conflict','Workbook ONLINE/LECTURE tabs differ materially from dedicated PDFs. PDFs imported as supplements; workbook tabs retained as alternate evidence.'),('LM','source_version_conflict','JC PDF shows only Math; populated workbook also includes Chemistry and Physics.'),('SM','source_version_conflict','Master JC Sunday Physics differs from T1 workbook.'),('BT','old_year_lower_primary','Pri 1& 2 tab says 2026; retained as alternate evidence, not current sessions.'),('JP','old_year_lower_primary','P1&2(X) and P3(X) tabs contain historical years; retained as alternate evidence, not current sessions.'),('PW','old_year_chinese','Chinese tab is labelled 2026; retained as alternate evidence, not current sessions.')]:self.issue(b,code,detail)
  # Potential duplicates are retained and grouped for review, never merged across levels blindly.
  groups=self.db.execute("select branch_id,subject,day,start_minute,end_minute,level_label,count(*) from ao_schedule_sessions where start_minute is not null and status='draft' group by branch_id,subject,day,start_minute,end_minute,level_label having count(*)>1").fetchall()
  for b,sub,day,start,end,label,n in groups:self.issue(b,'possible_duplicate',f'{sub}, {label}, day {day}, {start}-{end}: {n} source entries; review before combining.')
 def filter_catalogues(self):
  patterns=[('english','English',r'English'),('mathematics','Mathematics',r'Math'),('additional-mathematics','Additional Mathematics',r'A.?Math|Additional|E and/or A'),('elementary-mathematics','Elementary Mathematics',r'E.?Math|Elementary|E and/or A'),('science','Science',r'Science'),('chemistry','Chemistry',r'Chemistry'),('physics','Physics',r'Physics'),('biology','Biology',r'Biology'),('chinese','Chinese',r'Chinese'),('higher-chinese','Higher Chinese',r'Higher Chinese|\bHCL\b'),('general-paper','General Paper',r'General Paper|^GP$'),('economics','Economics',r'Economics|Econs'),('principles-of-accounts','Principles of Accounts',r'Account|^POA$'),('geography','Geography',r'Geography'),('social-studies','Social Studies',r'Social Studies|\bSS\b'),('history','History',r'History|\bHist\b'),('humanities','Humanities',r'Humanities')]
  for sid,name,_ in patterns:self.insert('ao_schedule_subjects',id=sid,name=name)
  for rid,raw,levels in self.db.execute('select id,subject,levels from ao_schedule_sessions').fetchall():
   for sid,_,pattern in patterns:
    if re.search(pattern,raw,re.I):self.insert('ao_schedule_session_subjects',id=jid(rid,sid),session_id=rid,subject_id=sid)
   for level in json.loads(levels):
    self.insert('ao_schedule_levels',id=level,name=level)
    self.insert('ao_schedule_session_levels',id=jid(rid,level),session_id=rid,level_id=level)
 def finish(self):
  summary={'sources':self.counts['source_files'],'sessions':self.db.execute("select count(*) from ao_schedule_sessions where status<>'discontinued'").fetchone()[0],'branches_with_sessions':self.db.execute("select count(distinct branch_id) from ao_schedule_sessions where status<>'discontinued'").fetchone()[0],'branches':len(BRANCHES),'published_sessions':self.db.execute("select count(*) from ao_schedule_sessions where status='published'").fetchone()[0],'issues':self.db.execute('select count(*) from ao_schedule_issues where resolved=0').fetchone()[0],'branch_counts':dict(self.db.execute("select branch_id,count(*) from ao_schedule_sessions where status<>'discontinued' group by branch_id"))}
  run=jid(*sorted(self.source_ids.values()));self.insert('ao_schedule_imports',id=run,imported_at=dt.datetime.now(dt.timezone.utc).isoformat(),summary=js(summary))
  self.db.commit();assert not self.db.execute('pragma foreign_key_check').fetchall();assert self.db.execute('pragma integrity_check').fetchone()[0]=='ok'
  (self.out/'import-summary.json').write_text(json.dumps(summary,indent=2))
  # A read-only review page makes the populated database inspectable without a database client.
  from html import escape
  branches=self.db.execute("select b.id,b.name,z.name,b.phone,b.whatsapp,b.contact_url,(select count(*) from ao_schedule_sessions s where s.branch_id=b.id and s.status<>'discontinued') from ao_schedule_branches b left join ao_schedule_zones z on z.id=b.zone_id order by z.name,b.name").fetchall()
  issues=self.db.execute('select branch_id,code,detail from ao_schedule_issues where resolved=0 order by branch_id,code,detail').fetchall()
  data=[]
  for row in self.db.execute("select s.id,s.branch_id,b.name,s.subject,s.level_label,s.levels,s.day,s.start_minute,s.end_minute,s.coach,s.delivery_mode,'','','','',f.relative_path from ao_schedule_sessions s join ao_schedule_branches b on b.id=s.branch_id left join ao_schedule_evidence e on e.id=(select min(ev.id) from ao_schedule_evidence ev join ao_schedule_sources fs on fs.id=ev.source_id where ev.session_id=s.id and fs.relative_path like '%.pdf') left join ao_schedule_sources f on f.id=e.source_id where (f.id is not null or json_extract(s.notes,'$.origin')='connect-editor' or s.branch_id='HM') and s.status<>'discontinued' and s.academic_year=2027 and s.level_label not like '%2026%' order by b.name,s.subject,s.day,s.start_minute"):
   public_row=list(row);public_row[15]='';data.append(public_row)
  branch_rows=''.join('<tr>'+''.join('<td>'+escape(str(v or 'Not supplied'))+'</td>' for v in r[1:5])+f'<td>{r[6]}</td></tr>' for r in branches)
  issue_rows=''.join('<tr>'+''.join('<td>'+escape(str(v or ''))+'</td>' for v in r)+'</tr>' for r in issues)
  report=(Path(__file__).parent/'templates/schedule-review.html.template').read_text()
  report=report.replace('SCHEDULEWEEKEDITOR',(Path(__file__).parent/'templates/schedule-week-editor.js').read_text())
  report=report.replace('SCHEDULEEDITOR',(Path(__file__).parent/'templates/schedule-editor.js').read_text())
  report=report.replace('BRANCHCONTACTS',(Path(__file__).resolve().parents[1]/'lib/schedule-branch-contacts.json').read_text())
  report=report.replace('SUBJECTALIASES',(Path(__file__).resolve().parents[1]/'lib/schedule-subject-aliases.json').read_text())
  report=report.replace('SUMMARY',escape(f"{summary['sources']} source files · {summary['sessions']} draft entries · {summary['branches_with_sessions']} source branches · 0 published sessions"))
  for key,value in [('BRANCHROWS',branch_rows),('ISSUEROWS',issue_rows),('BRANCHDATA',js(branches).replace('<','\\u003c')),('DATA',js(data).replace('<','\\u003c'))]:report=report.replace(key,value)
  (self.out/'schedule-import-review.html').write_text(report)
  public_dir=Path(__file__).resolve().parents[1]/'public'/'schedules'
  public_dir.mkdir(parents=True,exist_ok=True)
  (public_dir/'index.html').write_text(report)
  # PostgreSQL schema is separate from the source-data seed. JSON is retained losslessly as text.
  schema='begin;\n'+SCHEMA
  for table in re.findall(r'create table if not exists (\w+)',SCHEMA):
   schema+=f'\nalter table public.{table} enable row level security;\nrevoke all on public.{table} from public,anon,authenticated;\ngrant select,insert,update,delete on public.{table} to service_role;\n'
  schema+='\ncommit;\n'
  (self.out/'supabase-schedules-schema.sql').write_text(schema)
  def sql(v):return 'NULL' if v is None else str(v) if isinstance(v,(int,float)) else "'"+str(v).replace("'","''")+"'"
  seed=['begin;','-- Insert-only. Re-running preserves CRE changes. No schedules are published by this seed.']
  for table in self.rows:
   cursor=self.db.execute('select * from '+table);names=[d[0] for d in cursor.description];rows=[dict(zip(names,r)) for r in cursor.fetchall()]
   for row in rows:seed.append('insert into public.'+table+' ('+','.join(row)+') values ('+','.join(sql(v) for v in row.values())+') on conflict do nothing;')
  for rid in getattr(self,'pdf_retired',[]):seed.append("update public.ao_schedule_sessions set status='discontinued' where id="+sql(rid)+" and revision=1;")
  for rid in getattr(self,'pdf_current',[]):
   cursor=self.db.execute('select * from ao_schedule_sessions where id=?',(rid,));names=[d[0] for d in cursor.description];row=dict(zip(names,cursor.fetchone()))
   seed.append('update public.ao_schedule_sessions set '+','.join(k+'='+sql(v) for k,v in row.items() if k not in ['id','revision'])+' where id='+sql(rid)+' and revision=1;')
  seed.extend([NOVENA_MIGRATION,'commit;']);(self.out/'supabase-schedules-seed.sql').write_text('\n'.join(seed))
  (self.out/'supabase-schedules-install.sql').write_text(schema+'\n'+'\n'.join(seed)+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-schedule-editing.sql').read_text()+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-scheduling-v2.sql').read_text()+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-scheduling-v3.sql').read_text()+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-scheduling-v4.sql').read_text()+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-scheduling-v5.sql').read_text()+'\n'+(Path(__file__).resolve().parents[1]/'deployment/supabase-scheduling-v6.sql').read_text())
  print(json.dumps(summary,indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--extraction-cache',type=Path)
 a=p.parse_args();i=Importer(a.source,a.output,a.extraction_cache);i.inventory();i.workbook_sessions();i.pdf_supplements();i.contacts()
 from schedule_pdf_priority import apply_pdf_priority
 apply_pdf_priority(i,(DAY,TIME,SUBJECT,level_codes,subject,jid));i.review();i.filter_catalogues();i.finish()

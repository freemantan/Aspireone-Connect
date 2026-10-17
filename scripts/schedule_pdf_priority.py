"""Read PDF timetable cells by weekday coordinates. Keep spreadsheets as fallback."""
import collections, json, re
from pathlib import Path
import pdfplumber

def apply_pdf_priority(imp, helpers):
 DAY,TIME,SUBJECT,level_codes,subject,jid=helpers
 def eligible(rel,s):
  if not rel.lower().endswith('.pdf') or s['kind']!='schedule':return False
  b=s['branch'];name=Path(rel).name
  if b=='PW':return '/Schedule only/' in rel
  if b=='WM':return '/Schedule Only/' in rel
  if b=='BM':return '/Schedule & Pricelist/' not in rel
  if b=='WL':return '_EMS_' not in name
  return True
 selected=[r for r,s in imp.sources.items() if eligible(r,s)]
 prior={r[0] for r in imp.db.execute('select id from ao_schedule_sessions')}
 coverage=collections.defaultdict(set);created=[];reports=[]
 def refresh(rid):
  row=imp.rows['ao_schedule_sessions'][-1]
  fields=[k for k in row if k not in ['id','revision']]
  imp.db.execute('update ao_schedule_sessions set '+','.join(k+'=?' for k in fields)+' where id=? and revision=1',[row[k] for k in fields]+[rid])
  flags=json.loads(row['notes'])['flags']
  imp.db.execute('update ao_schedule_issues set resolved=1 where session_id=?',(rid,))
  if flags:imp.db.execute('update ao_schedule_issues set resolved=0 where session_id=? and code in ('+','.join('?' for _ in flags)+')',[rid]+flags)
 def pdf_label(lines,h_top):
  candidates=[l['text'] for l in lines if l['bottom']<h_top and re.search(r'Primary|Secondary|\bSec\b|College|IP.?IB|IP/IB|IP\s*Y|JC/IP|JC 1|JC1|IPIB|IP \(',l['text'],re.I) and not TIME.search(l['text']) and not re.search(r'\b(?:Contact|Rate|subject|Remarks)\b|Academic Fees',l['text'],re.I)]
  return ' / '.join(candidates)
 for rel in selected:
  src=imp.sources[rel];b=src['branch'];sid=imp.source_ids[rel];doc_rows=[];expected_total=0;matched_total=0
  with pdfplumber.open(src['path']) as pdf:
   for pn,page in enumerate(pdf.pages):
    lines=page.extract_text_lines();words=page.extract_words();heads=[]
    for l in lines:
     daywords=sorted([dict(w,day=re.search(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$',w['text'],re.I)[1].title()) for w in words if abs(w['top']-l['top'])<3 and re.search(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$',w['text'],re.I)],key=lambda w:w['x0'])
     if len(daywords)==7 and [w['day'] for w in daywords]==DAY:heads.append((l,daywords))
    if not heads:continue
    cutoff=min([l['top'] for l in lines if re.search(r'Term\s*1.*Calendar|^Term\s*1\s*2027|Management reserves|Academic Calendar',l['text'],re.I)]+[page.height])
    heads=[h for h in heads if h[0]['top']<cutoff]
    if not heads:continue
    # Count time tokens from original characters rather than line-flattened columns.
    for hi,(head,daywords) in enumerate(heads):
     prev=[l for l in lines if l['bottom']<=head['top'] and (SUBJECT.search(l['text']) or re.match(r'^(Primary|Secondary)\s*\d',l['text'],re.I)) and not re.search(r'Education|Contact|Road|Email',l['text'],re.I)]
     heading=prev[-1]['text'] if prev else ''
     # A freeform timetable (JP) labels subjects within each weekday cell.
     title=pdf_label(lines,heads[0][0]['top']);base_levels=level_codes(title)
     cl='Chinese Language Class Schedule' in '\n'.join(l['text'] for l in lines[:12])
     inline_level=re.search(r'(?:Primary|Secondary)\s*\d(?:\s*[/&-]\s*\d)?',head['text'],re.I)
     if cl and inline_level:title=inline_level[0];heading=title;base_levels=level_codes(title)
     elif cl and re.match(r'^(Primary|Secondary)\s*\d',heading,re.I):title=heading;base_levels=level_codes(title)
     split=re.split(r'(?:Class\s+)?conducted by',heading,flags=re.I)
     base_subject=('Chinese / Higher Chinese' if re.search('Chinese.*Higher Chinese',heading,re.I) else 'Higher Chinese' if 'Higher Chinese' in heading else 'Chinese') if cl else subject(split[0]) if split else None
     coach='Conducted by '+split[1] if len(split)>1 else ''
     if not base_subject and b!='JP':continue
     coverage[b].update(base_levels)
     stop=cutoff
     if hi+1<len(heads):
      nh=heads[hi+1][0]
      following=[l['top'] for l in lines if l['top']>head['bottom'] and l['bottom']<=nh['top'] and (SUBJECT.search(l['text']) or re.match(r'^(Primary|Secondary)\s*\d',l['text'],re.I)) and not TIME.search(l['text'])]
      stop=min(following) if following else nh['top']-2
     centers=[(w['x0']+w['x1'])/2 for w in daywords];edges=[0]+[(centers[i]+centers[i+1])/2 for i in range(6)]+[page.width]
     for day in range(7):
      raw=page.crop((edges[day],head['bottom']+1,edges[day+1],max(head['bottom']+2,stop))).extract_text() or ''
      matches=list(TIME.finditer(raw));expected_total+=len(matches)
      if not matches and re.search(r'enquire|check with|special arrangement',raw,re.I) and base_subject:
       rid=imp.add_session(b,rel,None,f'PDF page {pn+1}, table {hi+1}, {DAY[day]}, enquiry',title,base_subject,day+1,raw,coach,context=heading,extra=[])
       refresh(rid);doc_rows.append(rid);created.append(rid)
      for mi,m in enumerate(matches):
       following=raw[m.end():];segment=raw[m.end():matches[mi+1].start() if mi+1<len(matches) else len(raw)]
       inline_subject=next((subject(l) for l in following.splitlines() if subject(l) and not re.search(r'Coach|conducted',l,re.I)),None) if b=='JP' else None
       inline_coach=next((l.strip() for l in following.splitlines() if re.search(r'\bCoach\b',l)),None) if b=='JP' else None
       sub=inline_subject or base_subject
       if not sub:
        imp.issue(b,'pdf_subject_unresolved',f'{rel}, page {pn+1}, table {hi+1}, {DAY[day]}: {raw}',source=sid);continue
       assigned=inline_coach or coach
       code=re.match(r'\s*\(([A-Za-z]{1,4})\)',segment)
       if code:
        names=re.findall(r'Coach\s*([^,;(]+)',assigned,re.I)
        aliases={}
        for name in names:
         spaced=re.sub(r'(?<=[a-z])(?=[A-Z])',' ',name.strip())
         initials=''.join(w[0] for w in spaced.split()).upper()
         aliases[initials]=spaced
        if code[1].upper() in aliases:assigned='Coach '+aliases[code[1].upper()]+' ('+code[1].upper()+')'
        else:assigned=(assigned+' · Slot coach: '+code[1]).strip(' ·')
       label=title;override=None
       # Dedicated online/lecture tables put the level immediately beneath each time.
       if Path(rel).name in ['online class.pdf','lecture class.pdf']:
        label=next((l.strip() for l in segment.splitlines() if level_codes(l)),title)
        override=level_codes(label)
       elif re.search(r'\b(?:P[1-6]|Sec(?:ondary)?\s*[1-5]|JC[12])\b',segment,re.I):override=level_codes(segment) or None
       if re.search(r'\bJ[12]\b',segment):override=['JC'+x for x in re.findall(r'\bJ([12])\b',segment)]
       mode='online' if Path(rel).name=='online class.pdf' or 'ONLINE' in (sub+' '+raw).upper() else 'unspecified'
       fmt='lecture' if Path(rel).name=='lecture class.pdf' else 'unspecified'
       loc=f'PDF page {pn+1}, table {hi+1}, {DAY[day]}, slot {mi+1}'
       rid=imp.add_session(b,rel,None,loc,label,sub,day+1,raw,assigned,mode,fmt,heading,match=m,extra=[],levels_override=override)
       refresh(rid);doc_rows.append(rid);created.append(rid);matched_total+=1
       # Coverage tracks the PDF's programme level, not an individual slot restriction.
       coverage[b].update(base_levels or level_codes(label))
  reports.append({'source':rel,'parsed_time_ranges':matched_total,'detected_time_ranges':expected_total,'entries':len(doc_rows)})
  if matched_total!=expected_total:imp.issue(b,'pdf_time_coverage',f'{rel}: detected {expected_total}, parsed {matched_total}.',source=sid)
 # PDF level coverage retires only untouched imported entries. CRE revisions remain intact.
 retired=[]
 for rid,b,levels,revision,notes in imp.db.execute('select id,branch_id,levels,revision,notes from ao_schedule_sessions').fetchall():
  if rid in created or json.loads(notes).get('origin')=='connect-editor':continue
  codes=set(json.loads(levels))
  pdf_old=imp.db.execute("select count(*) from ao_schedule_evidence where session_id=? and locator like 'PDF page %'",(rid,)).fetchone()[0]
  if rid in prior and (codes.intersection(coverage[b]) or pdf_old) and revision==1:
   meta=json.loads(notes);meta['superseded_by']='PDF priority extraction'
   imp.db.execute("update ao_schedule_sessions set status='discontinued',notes=? where id=?",(json.dumps(meta),rid));retired.append(rid)
   imp.db.execute('update ao_schedule_issues set resolved=1 where session_id=?',(rid,))
 # Do not silently discard a CRE revision that differs from the PDF.
 for rid,b,revision in imp.db.execute('select id,branch_id,revision from ao_schedule_sessions where revision>1').fetchall():
  if b in coverage:imp.issue(b,'cre_revision_preserved','Existing CRE edit retained during PDF-priority reconciliation.',session=rid)
 imp.pdf_retired=retired
 # Repeated Chinese pages in combined brochures are the same offering. Preserve all evidence.
 unique={}
 for rid,b,sub,levels,day,start,end,coach,mode,fmt,raw in imp.db.execute("select id,branch_id,subject,levels,day,start_minute,end_minute,coach,delivery_mode,format,raw_time from ao_schedule_sessions where status='draft'").fetchall():
  if rid not in created:continue
  key=(b,sub,levels,day,start,end,coach,mode,fmt) if start is not None else (b,sub,levels,day,raw)
  if key not in unique:unique[key]=rid;continue
  canonical=unique[key]
  for source,sheet,loc,rv,rc in imp.db.execute('select source_id,sheet,locator,raw_value,raw_context from ao_schedule_evidence where session_id=?',(rid,)).fetchall():imp.insert('ao_schedule_evidence',id=jid(canonical,source,loc),session_id=canonical,source_id=source,sheet=sheet,locator=loc,raw_value=rv,raw_context=rc)
  imp.db.execute("update ao_schedule_sessions set status='discontinued' where id=? and revision=1",(rid,));imp.pdf_retired.append(rid)
 imp.pdf_current=created
 # A 2027 folder/calendar does not override a class heading explicitly labelled 2026.
 for (rid,) in imp.db.execute("select id from ao_schedule_sessions where academic_year=2026 or level_label like '%2026%'").fetchall():
  imp.db.execute("update ao_schedule_sessions set status='discontinued' where id=?",(rid,))
  imp.pdf_retired.append(rid)
 imp.db.execute("update ao_schedule_issues set resolved=1 where session_id in (select id from ao_schedule_sessions where status='discontinued')")
 imp.pdf_report=reports
 imp.db.commit()
 (imp.out/'pdf-extraction-check.json').write_text(json.dumps({'files':reports,'pdf_entries':len(created),'superseded_import_entries':len(retired)},indent=2))

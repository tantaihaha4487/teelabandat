from pathlib import Path
import html,re
root=Path(__file__).resolve().parents[2]
src=root.parent/'python101/docs/th'
def esc(x):return html.escape(x)
def text(x,y,lines,size=18,color='#352348'):
 return ''.join(f'<text x="{x}" y="{y+(i-(len(lines)-1)/2)*25}" text-anchor="middle" dominant-baseline="middle" font-size="{size}" fill="{color}">{esc(t)}</text>' for i,t in enumerate(lines))
def box(x,y,lines,w=270):return f'<rect x="{x-w/2}" y="{y-29}" width="{w}" height="58" rx="7" fill="#efe4f2" stroke="#6741a5"/>'+text(x,y,lines)
def diamond(x,y,lines):return f'<path d="M{x} {y-54}L{x+114} {y}L{x} {y+54}L{x-114} {y}Z" fill="#f1e9dd" stroke="#6741a5"/>'+text(x,y,lines,16)
def arrow(d,label=None,x=0,y=0):return f'<path d="{d}" fill="none" stroke="#6741a5" stroke-width="2" marker-end="url(#arrow)"/>'+(text(x,y,[label],15) if label else '')
def write(name,index,title,desc,body,w=760,h=560):
 source=re.findall(r'```mermaid\n(.*?)```',(src/(name+'.md')).read_text(),re.S)[index-1]
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{esc(title)}</title><desc id="desc">{esc(desc)}</desc><metadata>{esc(source)}</metadata><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#6741a5"/></marker></defs><g font-family="IBM Plex Sans Thai,Noto Sans Thai,sans-serif">{body}</g></svg>'''
 (root/'public/diagrams'/f'python101-{name}-{index}.svg').write_text(svg)
body=box(320,50,['รับคะแนนจากผู้ใช้'])+diamond(320,165,['คะแนน >= 80?'])+box(610,165,['แสดง ดีมาก'],210)+diamond(320,325,['คะแนน >= 50?'])+box(610,325,['แสดง ผ่าน'],210)+box(320,485,['แสดง ต้องฝึกเพิ่ม'])
body+=arrow('M320 79V109')+arrow('M434 165H501','ใช่',467,145)+arrow('M320 219V269','ไม่ใช่',355,244)+arrow('M434 325H501','ใช่',467,305)+arrow('M320 379V453','ไม่ใช่',355,415)
write('conditions',1,'เลือกทางทำงานตามคะแนน','รับคะแนน ถ้าคะแนนอย่างน้อย 80 แสดง ดีมาก หากยังไม่ถึงให้ตรวจว่าอย่างน้อย 50 หรือไม่ ถ้าใช่แสดง ผ่าน ถ้าไม่ใช่แสดง ต้องฝึกเพิ่ม',body,h=540)
body=box(365,50,['เริ่ม loop'])+box(365,150,['หยิบค่าถัดไปจาก range หรือ list'])+diamond(365,270,['ยังมีค่าอยู่ไหม?'])+box(365,400,['ทำงานใน block ของ loop'])+box(620,400,['ออกจาก loop'],190)
body+=arrow('M365 79V119')+arrow('M365 179V214')+arrow('M365 324V369','มี',390,345)+arrow('M479 270H620V369','ไม่มี',570,249)+arrow('M230 400H100V150H228','กลับไปหยิบค่าถัดไป',142,296)
write('loops',1,'ลำดับการทำงานของ for loop','เริ่ม loop แล้วหยิบค่าถัดไป ถ้ายังมีค่าจะทำงานใน block และกลับไปหยิบค่าถัดไปอีกครั้ง ถ้าไม่มีค่าจะออกจาก loop',body,h=475)
body=box(360,50,['เริ่ม while'])+diamond(360,170,['เงื่อนไขเป็นจริงไหม?'])+box(360,300,['ทำงานใน loop'])+box(360,410,['อัปเดตค่าที่เกี่ยวกับเงื่อนไข'])+box(630,300,['ออกจาก loop'],180)
body+=arrow('M360 79V114')+arrow('M360 224V269','จริง',389,247)+arrow('M360 329V379')+arrow('M474 170H630V269','เท็จ',575,149)+arrow('M225 410H90V170H244','ตรวจเงื่อนไขอีกครั้ง',145,290)
write('loops',2,'ลำดับการทำงานของ while loop','ตรวจเงื่อนไขก่อน ถ้าเป็นจริงจะทำงานใน loop อัปเดตค่าที่เกี่ยวข้อง แล้วกลับไปตรวจเงื่อนไขใหม่ ถ้าเป็นเท็จจะออกจาก loop',body,h=480)
labels=[['สัปดาห์ 1','Syntax และ Input'],['สัปดาห์ 2','Condition, Loop, Data'],['สัปดาห์ 3','Function, File, Error'],['สัปดาห์ 4','OOP และ Projects'],['เลือกสายต่อยอด','Web, Data,','Automation, AI']]
body=''
for i,lines in enumerate(labels):
 x=115+i*220;body+=box(x,100,lines,200)
 if i<4:body+=arrow(f'M{x+101} 100H{x+117}')
write('roadmap',1,'เส้นทางเรียนรู้สี่สัปดาห์','สัปดาห์แรกเรียนไวยากรณ์และการรับข้อมูล สัปดาห์ที่สองเรียนเงื่อนไข ลูป และข้อมูล สัปดาห์ที่สามเรียนฟังก์ชัน ไฟล์ และข้อผิดพลาด สัปดาห์ที่สี่เรียน OOP และโครงงาน แล้วเลือกเรียนต่อด้านเว็บ ข้อมูล ระบบอัตโนมัติ หรือ AI',body,w=1110,h=205)
print('Rendered 4 diagrams preserving source nodes, branches and loop-back edges.')

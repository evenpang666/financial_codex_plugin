"""Build a clean distributable; never include credentials, user data or local venvs."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT=Path(__file__).resolve().parent.parent
output=ROOT/'dist';output.mkdir(exist_ok=True)
target=output/'financial-agent-1.0.0.zip'
folders=['.codex-plugin','lib','engine','scripts','skills','web','tests','data-corrections','node_modules']
files=[ROOT/name for name in ['.mcp.json','marketplace.example.json','.env.example','package.json','package-lock.json','requirements.txt','README.md','LICENSE','start.bat','start.sh']]
for folder in folders:
    files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.log','.tmp'))
files.extend((ROOT/'config').glob('*.example.*'))
files.extend((ROOT/'docs').glob('*.md'))
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        archive.write(path,path.relative_to(ROOT).as_posix())
    archive.writestr('.agents/plugins/marketplace.json',(ROOT/'marketplace.example.json').read_text(encoding='utf-8-sig'))
with ZipFile(target) as archive:
    archive.extractall(output/'financial-agent')
digest=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256').write_text(digest+'  '+target.name+'\n')
print(json.dumps({'archive':str(target),'directory':str(output/'financial-agent'),'files':len(set(files))+1,'sha256':digest},ensure_ascii=False))

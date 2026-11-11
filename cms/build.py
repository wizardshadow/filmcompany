"""Generate stable editable fields and the Worker text module."""
from pathlib import Path
import json
import mimetypes
import shutil
from bs4 import BeautifulSoup, NavigableString

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
soup = BeautifulSoup((root / "cms/site-template.html").read_text(encoding="utf-8"), "html.parser")
fields = {}
counter = 0
for element in list(soup.select("h1,h2,p,a,span.tags,.service>span,.case-card>span")):
    if element.find_parent(["script", "style", "form"]) or element.select_one("[data-cms]"):
        continue
    for text in list(element.descendants):
        if not isinstance(text, NavigableString) or not str(text).strip():
            continue
        if text.find_parent(["script", "style"]) or text.parent.has_attr("data-cms"):
            continue
        counter += 1
        key = f"text-{counter:03d}"
        wrapper = soup.new_tag("cms-text", attrs={"data-cms": key})
        wrapper.string = str(text)
        fields[key] = {"type": "text", "value": str(text)}
        text.replace_with(wrapper)
for index, element in enumerate(soup.select("img,video")):
    attribute = "data-src" if element.name == "video" else "src"
    value = element.get(attribute)
    if not value or (element.name == "img" and value.split("?")[0].endswith(".svg")):
        continue
    key = f"media-{index:03d}"
    element["data-cms"] = key
    fields[key] = {"type": "media", "attribute": attribute, "value": value}
(dist / "index.html").write_text(str(soup), encoding="utf-8")
files = {}
for path in dist.iterdir():
    if path.suffix not in (".html", ".css", ".js"):
        continue
    files["/" + path.name] = {
        "type": (mimetypes.guess_type(path.name)[0] or "text/plain") + "; charset=utf-8",
        "text": path.read_text(encoding="utf-8")
    }
server = dist / "server"
client = dist / "client"
client.mkdir(exist_ok=True)
shutil.copytree(dist / "assets", client / "assets", dirs_exist_ok=True)
shutil.copyfile(dist / "favicon.jpg", client / "favicon.jpg")
server.mkdir(exist_ok=True)
(server / "generated.mjs").write_text(
    "export const files = " + json.dumps(files, ensure_ascii=False) +
    ";\nexport const fields = " + json.dumps(fields, ensure_ascii=False) + ";\n",
    encoding="utf-8"
)
(server / "index.js").write_text((root / "cms/worker.mjs").read_text(encoding="utf-8"), encoding="utf-8")
print(f"Built {len(fields)} editable fields")

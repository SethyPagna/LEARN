import assert from "node:assert/strict"
import test from "node:test"
import { createDesignDoc, createDesignPage, designElement, parseDesign, serializeDesign } from "../../lib/design/document"
import { designFontFor, importPptxDesign, type PptxPicture } from "../../lib/design/from-pptx"
import { buildPptxPlan } from "../../lib/design/pptx"
import { readTableStyle } from "../../lib/design/table"
import { createZip } from "../../lib/export/zip"
import type { CanvasElement } from "../../lib/studio/canvas-engine"

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const relationships = (...items: string[]) => `<Relationships>${items.join("")}</Relationships>`
const relation = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`
const xfrm = (x: number, y: number, cx: number, cy: number, extra = "") => `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
const placeholder = (type: string, idx = "", box = "", text = "") => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${type} ${idx}"/><p:cNvSpPr/><p:nvPr><p:ph${type ? ` type="${type}"` : ""}${idx ? ` idx="${idx}"` : ""}/></p:nvPr></p:nvSpPr><p:spPr>${box}</p:spPr>${text ? `<p:txBody><a:bodyPr/><a:lstStyle/>${text}</p:txBody>` : ""}</p:sp>`
const paragraph = (text: string, run = "", properties = "") => `<a:p>${properties}<a:r><a:rPr lang="en-US"${run}/><a:t>${text}</a:t></a:r></a:p>`
const EMU = 12_192_000 / 1920 // one design pixel on a 16:9 slide

const theme = `<a:theme name="Test"><a:themeElements><a:clrScheme name="Test">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
</a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Calibri Light"/></a:minorFont></a:fontScheme>
<a:fmtScheme><a:lnStyleLst><a:ln w="6350"/><a:ln w="12700"/><a:ln w="19050"/></a:lnStyleLst></a:fmtScheme></a:themeElements></a:theme>`

const master = `<p:sldMaster><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>
${placeholder("title", "", xfrm(838200, 365125, 10515600, 1325563))}
${placeholder("body", "1", xfrm(838200, 1825625, 10515600, 4351338))}
<p:sp><p:nvSpPr><p:cNvPr id="9" name="Brand bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 12192000, 190500)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>
</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"/>
<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buNone/><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`

// The layout moves the body placeholder and leaves the title where the master put it.
const layout = `<p:sldLayout><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${placeholder("title")}${placeholder("", "1", xfrm(838200, 2000000, 5000000, 3000000))}</p:spTree></p:cSld></p:sldLayout>`

const slideOne = `<p:sld><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>
${placeholder("title", "", "", paragraph("Cells"))}
${placeholder("", "1", "", paragraph("The unit of life") + paragraph("Found everywhere"))}
${placeholder("body", "13", "", "")}
<p:sp><p:nvSpPr><p:cNvPr id="4" name="Callout"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(100 * EMU, 900 * EMU, 600 * EMU, 100 * EMU)}<a:prstGeom prst="rect"/><a:noFill/></p:spPr>
<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2400" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>Look closer</a:t></a:r></a:p></p:txBody></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="5" name="Microscope"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:srcRect l="20000" r="0"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(1200 * EMU, 300 * EMU, 400 * EMU, 300 * EMU, ' flipH="1"')}</p:spPr></p:pic>
<p:pic><p:nvPicPr><p:cNvPr id="6" name="Old clip art"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdEmf"/></p:blipFill><p:spPr>${xfrm(0, 0, 100 * EMU, 100 * EMU)}</p:spPr></p:pic>
<p:sp><p:nvSpPr><p:cNvPr id="7" name="Badge"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(1500 * EMU, 800 * EMU, 200 * EMU, 200 * EMU)}<a:prstGeom prst="ellipse"/></p:spPr>
<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>
<p:txBody><a:bodyPr/><a:lstStyle/>${paragraph("New")}</p:txBody></p:sp>
<p:grpSp><p:nvGrpSpPr><p:cNvPr id="8" name="Pair"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${200 * EMU}" y="${100 * EMU}"/><a:ext cx="${200 * EMU}" cy="${100 * EMU}"/><a:chOff x="0" y="0"/><a:chExt cx="${400 * EMU}" cy="${200 * EMU}"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="10" name="Left"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 200 * EMU, 200 * EMU)}<a:prstGeom prst="roundRect"/><a:solidFill><a:srgbClr val="00FF00"><a:alpha val="50000"/></a:srgbClr></a:solidFill></p:spPr></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="11" name="Right"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(200 * EMU, 0, 200 * EMU, 200 * EMU)}<a:prstGeom prst="upArrow"/><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="000000"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill></p:spPr></p:sp>
</p:grpSp>
<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="12" name="Pointer"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(800 * EMU, 800 * EMU, 100 * EMU, 100 * EMU)}<a:prstGeom prst="straightConnector1"/><a:ln w="${4 * EMU}"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr></p:cxnSp>
<p:sp><p:nvSpPr><p:cNvPr id="13" name="Hidden" hidden="1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 10, 10)}<a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></p:spPr></p:sp>
</p:spTree></p:cSld><p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst><p:seq><p:cTn id="2"><p:childTnLst><p:par><p:cTn id="3" presetClass="entr" presetID="10"/></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>`

const slideTwo = `<p:sld show="0" showMasterSp="0"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Scores"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * EMU}" y="${100 * EMU}"/><a:ext cx="${800 * EMU}" cy="${200 * EMU}"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr h="1"><a:tc><a:txBody><a:bodyPr/>${paragraph("A", ' sz="2000"')}</a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/>${paragraph("B")}</a:txBody></a:tc></a:tr><a:tr h="1"><a:tc><a:txBody><a:bodyPr/>${paragraph("1")}</a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/>${paragraph("2")}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></p:xfrm><a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame>
<p:pic><p:nvPicPr><p:cNvPr id="5" name="Microscope again"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdSame"/></p:blipFill><p:spPr>${xfrm(0, 0, 100 * EMU, 100 * EMU)}</p:spPr></p:pic>
</p:spTree></p:cSld><mc:AlternateContent><mc:Choice Requires="p14"><p:transition p14:dur="700"><p:fade/></p:transition></mc:Choice><mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback></mc:AlternateContent></p:sld>`

function deck(overrides: Record<string, string | Uint8Array> = {}, size = { cx: 12192000, cy: 6858000 }) {
  const parts: Record<string, string | Uint8Array> = {
    "_rels/.rels": relationships(relation("rId1", "officeDocument", "ppt/presentation.xml")),
    "ppt/presentation.xml": `<p:presentation xmlns:r="${REL}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdA"/><p:sldId id="257" r:id="rIdB"/></p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": relationships(relation("rIdMaster", "slideMaster", "slideMasters/slideMaster1.xml"), relation("rIdB", "slide", "slides/slide2.xml"), relation("rIdA", "slide", "slides/slide1.xml")),
    "ppt/slideMasters/slideMaster1.xml": master,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relationships(relation("rId1", "theme", "../theme/theme1.xml")),
    "ppt/theme/theme1.xml": theme,
    "ppt/slideLayouts/slideLayout1.xml": layout,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relationships(relation("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")),
    "ppt/slides/slide1.xml": slideOne,
    "ppt/slides/_rels/slide1.xml.rels": relationships(relation("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), relation("rIdImage", "image", "../media/image1.png"), relation("rIdEmf", "image", "../media/image2.emf"), relation("rIdNotes", "notesSlide", "../notesSlides/notesSlide1.xml")),
    "ppt/slides/slide2.xml": slideTwo,
    "ppt/slides/_rels/slide2.xml.rels": relationships(relation("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), relation("rIdSame", "image", "../media/image1.png")),
    "ppt/notesSlides/notesSlide1.xml": `<p:notes><p:cSld><p:spTree>${placeholder("sldImg")}${placeholder("body", "1", "", paragraph("Say hello"))}${placeholder("sldNum", "5", "", paragraph("1"))}</p:spTree></p:cSld></p:notes>`,
    "ppt/media/image1.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    "ppt/media/image2.emf": new Uint8Array([1, 0, 0, 0]),
    "docProps/core.xml": "<cp:coreProperties><dc:title>Imported deck</dc:title></cp:coreProperties>",
    ...overrides,
  }
  return createZip(Object.entries(parts).map(([name, data]) => ({ name, data })))
}

async function importWithPictures(bytes: Uint8Array) {
  const placed: PptxPicture[] = []
  const progress: string[] = []
  const result = await importPptxDesign(bytes, {
    id: "design_from_pptx",
    placePicture: async (picture) => { placed.push(picture); return `/api/files/file_${placed.length}/download` },
    onProgress: ({ done, total }) => progress.push(`${done}/${total}`),
  })
  return { ...result, placed, progress }
}

test("a PowerPoint slide keeps its layout: placeholders from the layout and master, theme colours and fonts", async () => {
  const { design, warnings, placed, progress } = await importWithPictures(deck())
  assert.equal(design.id, "design_from_pptx")
  assert.equal(design.name, "Imported deck")
  assert.deepEqual([design.format, design.width, design.height], ["presentation", 1920, 1080])
  assert.equal(design.pages.length, 2)

  const [first] = design.pages
  assert.equal(first.background, "#FFFFFF", "the master's bg1 reference is the theme's light colour")
  assert.equal(first.notes, "Say hello")
  assert.equal(first.hidden, false)
  assert.equal(first.transition, "none", "no transition in PowerPoint is a cut")
  const byName = new Map(first.elements.map((element) => [String(element.style.name), element]))

  const bar = byName.get("Brand bar")!
  assert.equal(first.elements[0], bar, "master decorations sit under the slide's shapes")
  assert.deepEqual([bar.type, bar.style.shape, bar.style.fill, bar.width, bar.height], ["shape", "rect", "#4472C4", 1920, 30])

  const title = first.elements.find((element) => element.content === "Cells")!
  assert.deepEqual([title.x, title.y, title.width, title.height], [132, 57.5, 1656, 208.75], "an unmoved title sits where the master put it")
  assert.deepEqual([title.style.fontSize, title.style.fontFamily, title.style.fontWeight, title.style.color, title.style.textAlign, title.style.lineHeight], [88, "lora", 400, "#000000", "center", 1.08])
  assert.equal(title.style.list, undefined, "the title style turns bullets off")

  const body = first.elements.find((element) => element.content === "The unit of life\nFound everywhere")!
  assert.deepEqual([Math.round(body.x), Math.round(body.y), Math.round(body.width)], [132, 315, 787], "the layout's position wins over the master's")
  assert.deepEqual([body.style.fontSize, body.style.list, body.style.fontFamily, body.style.fontWeight, body.style.color], [56, "bullet", "sans", 300, "#404040"])
  assert.equal(first.elements.some((element) => element.style.name === "body 13"), false, "an empty placeholder is a prompt, not content")

  const callout = byName.get("Callout")!
  assert.deepEqual([callout.type, callout.x, callout.y, callout.width, callout.height], ["text", 100, 900, 600, 100])
  assert.deepEqual([callout.style.fontSize, callout.style.fontWeight, callout.style.color, callout.style.textAlign, callout.style.verticalAlign, callout.style.backgroundColor], [48, 700, "#FF0000", "center", "middle", undefined])

  const picture = byName.get("Microscope")!
  assert.deepEqual([picture.type, picture.content, picture.x, picture.width, picture.style.flipX, picture.style.focusX], ["image", "/api/files/file_1/download", 1200, 400, true, 0.6])
  assert.equal(first.elements.some((element) => element.style.name === "Old clip art"), false)
  assert.deepEqual(placed.map((item) => [item.path, item.type, item.name]), [["ppt/media/image1.png", "image/png", "image1.png"]], "a picture used on two slides is stored once; EMF is never sent")
  assert.deepEqual(progress, ["0/1", "1/1"])

  const badgeShape = first.elements.find((element) => element.style.name === "Badge" && element.type === "shape")!
  const badgeText = first.elements.find((element) => element.style.name === "Badge" && element.type === "text")!
  assert.deepEqual([badgeShape.style.shape, badgeShape.style.fill, badgeShape.style.stroke, badgeShape.style.strokeWidth], ["ellipse", "#ED7D31", "#223962", 2], "style references give the fill and outline")
  assert.equal(badgeText.style.color, "#FFFFFF", "the shape's font reference beats the deck's default text colour")
  assert.ok(badgeShape.groupId && badgeShape.groupId === badgeText.groupId, "text on a shape moves with it")

  const left = byName.get("Left")!
  const right = byName.get("Right")!
  assert.deepEqual([left.x, left.y, left.width, left.height, left.style.shape, left.style.opacity], [200, 100, 100, 100, "rounded", 0.5], "group children are scaled from the group's child space")
  assert.deepEqual([right.x, right.y, right.width, right.height, right.rotation, right.style.fill, right.style.fill2, right.style.gradientAngle], [300, 100, 100, 100, 270, "#000000", "#FFFFFF", 180])
  assert.ok(left.groupId && left.groupId === right.groupId && left.groupId !== badgeShape.groupId)

  const pointer = byName.get("Pointer")!
  assert.deepEqual([pointer.style.shape, pointer.style.stroke, pointer.style.strokeWidth, pointer.style.dash, pointer.rotation, Math.round(pointer.width)], ["line", "#333333", 4, "dashed", 45, 141])
  assert.equal(first.elements.some((element) => element.style.name === "Hidden"), false)

  const [second] = design.pages.slice(1)
  assert.deepEqual([second.hidden, second.background, second.transition], [true, "#112233", "fade"])
  assert.equal(second.elements.some((element) => element.style.name === "Brand bar"), false, "showMasterSp=0 hides the master's shapes")
  const table = second.elements.find((element) => element.style.name === "Scores")!
  assert.deepEqual([table.type, table.content, table.style.fontSize, table.x, table.width, table.style.header, table.style.rows], ["table", "A\tB\n1\t2", 40, 100, 800, undefined, [0.5, 0.5]], "a table with no style and no fills is a plain table")
  assert.equal(second.elements.find((element) => element.style.name === "Microscope again")?.content, "/api/files/file_1/download")

  assert.deepEqual(warnings, [
    "A picture couldn't be shown (for example an EMF or WMF file) and was left out.",
    "A chart or diagram was left out.",
    "Animations weren't brought in.",
  ])
  assert.equal(serializeDesign(parseDesign(serializeDesign(design))), serializeDesign(design), "the import is a normal, stable design")
})

const cell = (text: string, run = "", properties = "", attributes = "", inside = "") => `<a:tc${attributes}><a:txBody><a:bodyPr/><a:lstStyle/>${text.split("/").map((line) => paragraph(line, run)).join("")}</a:txBody><a:tcPr${properties}>${inside}</a:tcPr></a:tc>`
const tableFrame = (name: string, id: number, y: number, table: string) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * EMU}" y="${y * EMU}"/><a:ext cx="${800 * EMU}" cy="${200 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">${table}</a:graphicData></a:graphic></p:graphicFrame>`

test("a PowerPoint table comes in as a table: grid, header and banded rows from its table style, merged cells split", async () => {
  // PowerPoint's default style, named but not defined in the file.
  const organelles = `<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>
<a:tblGrid><a:gridCol w="${300 * EMU}"/><a:gridCol w="${500 * EMU}"/></a:tblGrid>
<a:tr h="${60 * EMU}">${cell("Organelles", ' sz="1800"', "", ' gridSpan="2"')}<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></a:txBody><a:tcPr/></a:tc></a:tr>
<a:tr h="${70 * EMU}">${cell("Nucleus/(control)", ' sz="2000"', ' anchor="ctr"')}${cell("DNA", ' sz="2000"')}</a:tr>
<a:tr h="${70 * EMU}">${cell("Ribosome", ' sz="2000"')}${cell("Protein", ' sz="2000"')}</a:tr></a:tbl>`
  // A style the file defines itself: a grey fill, dark text and a theme line between rows.
  const plain = `<a:tbl><a:tblPr><a:tableStyleId>{0000TEST}</a:tableStyleId></a:tblPr><a:tblGrid><a:gridCol w="1"/><a:gridCol w="1"/><a:gridCol w="2"/></a:tblGrid>
<a:tr h="0">${cell("A")}${cell("B")}${cell("C")}</a:tr><a:tr h="0">${cell("1")}${cell("2")}${cell("3")}</a:tr></a:tbl>`
  const tableStyles = `<a:tblStyleLst def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"><a:tblStyle styleId="{0000TEST}" styleName="Test"><a:wholeTbl><a:tcTxStyle><a:fontRef idx="major"/><a:srgbClr val="333333"/></a:tcTxStyle><a:tcStyle><a:tcBdr><a:insideH><a:lnRef idx="2"><a:schemeClr val="accent2"/></a:lnRef></a:insideH></a:tcBdr><a:fill><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle></a:tblStyleLst>`
  // More rows and columns than a design table holds; each cell's own lines are turned off.
  const off = ["lnL", "lnR", "lnT", "lnB"].map((side) => `<a:${side} w="0"><a:noFill/></a:${side}>`).join("")
  const big = `<a:tbl><a:tblPr><a:tableStyleId>{0000TEST}</a:tableStyleId></a:tblPr>${Array.from({ length: 32 }, (_, row) => `<a:tr h="1">${Array.from({ length: 12 }, (_, column) => cell(`${row}.${column}`, "", "", "", off)).join("")}</a:tr>`).join("")}</a:tbl>`
  const slide = `<p:sld><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${tableFrame("Organelles", 3, 100, organelles)}${tableFrame("Plain", 4, 400, plain)}${tableFrame("Big", 5, 700, big)}</p:spTree></p:cSld></p:sld>`
  const { design, warnings } = await importPptxDesign(deck({ "ppt/slides/slide2.xml": slide, "ppt/tableStyles.xml": tableStyles }))
  const byName = new Map(design.pages[1].elements.map((element) => [element.style.name, element]))

  const organelleTable = byName.get("Organelles")!
  assert.equal(organelleTable.type, "table")
  assert.equal(organelleTable.content, "Organelles\t\nNucleus (control)\tDNA\nRibosome\tProtein", "a merged cell keeps its text in the first cell; a cell's paragraphs join into one")
  const look = organelleTable.style
  assert.deepEqual([look.header, look.headerFill, look.headerColor, look.fill, look.banded, look.bandFill, look.color], [true, "#4472C4", "#FFFFFF", "#B4C7E7", true, "#DAE3F3", "#000000"], "Medium Style 2: accent header, the first body row the darker band")
  assert.deepEqual([look.stroke, look.strokeWidth, look.fontSize, look.verticalAlign, look.padding, look.columns, look.rows], ["#FFFFFF", 2, 40, "middle", 10.8, [0.375, 0.625], [0.3, 0.35, 0.35]])

  const plainTable = byName.get("Plain")!
  assert.deepEqual([plainTable.content, plainTable.style.header, plainTable.style.banded, plainTable.style.fill, plainTable.style.color, plainTable.style.fontFamily], ["A\tB\tC\n1\t2\t3", undefined, undefined, "#EEEEEE", "#333333", "lora"], "the file's own style; its heading font is Georgia")
  assert.deepEqual([plainTable.style.stroke, plainTable.style.strokeWidth, plainTable.style.columns, plainTable.style.rows, plainTable.style.verticalAlign], ["#ED7D31", 2, [0.25, 0.25, 0.5], undefined, "top"], "a theme line; rows PowerPoint sizes itself share evenly")

  const bigTable = byName.get("Big")!
  const rows = bigTable.content!.split("\n")
  assert.deepEqual([rows.length, rows[0].split("\t").length, rows[29].split("\t")[9], bigTable.style.stroke], [30, 10, "29.9", undefined], "cells that turn their lines off have none")

  assert.ok(warnings.includes("A table's merged cells came in as separate cells."))
  assert.ok(warnings.includes("A table holds up to 30 rows and 10 columns; the rest was cut."))
  assert.equal(serializeDesign(parseDesign(serializeDesign(design))), serializeDesign(design), "imported tables are normal, stable elements")
})

test("4:3 slides become 4:3 pages; other shapes are fitted onto the nearer size", async () => {
  const fourThree = await importPptxDesign(deck({}, { cx: 9144000, cy: 6858000 }))
  assert.deepEqual([fourThree.design.format, fourThree.design.width, fourThree.design.height], ["presentation-4-3", 1440, 1080])
  const callout = fourThree.design.pages[0].elements.find((element) => element.style.name === "Callout")!
  assert.equal(callout.style.fontSize, 48, "a 10-inch slide on a 1440px page is 2px a point, as a 13.33-inch one is on 1920px")
  assert.equal(fourThree.warnings.some((warning) => /different shape/.test(warning)), false)

  const wide = await importPptxDesign(deck({}, { cx: 12192000, cy: 7620000 }))
  assert.equal(wide.design.format, "presentation")
  const bar = wide.design.pages[0].elements.find((element) => element.style.name === "Brand bar")!
  assert.deepEqual([bar.x, bar.width], [96, 1728], "16:10 slides are letterboxed onto 16:9, centred")
  assert.match(wide.warnings.join(" "), /different shape, so they're fitted onto 16:9 pages/)
})

test("without a picture store, pictures are left out and said so; a file without a title takes the file name, then the first slide's", async () => {
  const { design, warnings } = await importPptxDesign(deck({ "docProps/core.xml": "<cp:coreProperties><dc:title>PowerPoint Presentation</dc:title></cp:coreProperties>" }))
  assert.equal(design.name, "Cells", "PowerPoint's placeholder title is not a name")
  assert.equal((await importPptxDesign(deck({ "docProps/core.xml": "<cp:coreProperties/>" }), { fallbackTitle: "Biology week 3" })).design.name, "Biology week 3")
  assert.equal(design.pages.flatMap((page) => page.elements).some((element) => element.type === "image"), false)
  assert.ok(warnings.includes("A picture was left out."))
  const failed = await importPptxDesign(deck(), { placePicture: async () => null })
  assert.ok(failed.warnings.includes("2 pictures couldn't be shown (for example EMF or WMF files) and were left out."), "a failed upload is reported with the unshowable ones")
})

test("a design exported to PowerPoint comes back where it was", async () => {
  const { default: PptxGen } = await import("pptxgenjs")
  const doc = createDesignDoc({ name: "Round trip", format: "presentation", pages: [createDesignPage({ background: "#0F172A", elements: [
    designElement({ type: "text", x: 120, y: 90, width: 1200, height: 160, content: "Photosynthesis", style: { fontFamily: "playfair", fontSize: 96, fontWeight: 700, color: "#F8FAFC" } }),
    designElement({ type: "text", x: 120, y: 320, width: 900, height: 400, content: "Light in\nSugar out", style: { fontFamily: "sans", fontSize: 44, color: "#CBD5E1", list: "bullet" } }),
    designElement({ type: "shape", x: 1300, y: 300, width: 400, height: 400, style: { shape: "ellipse", fill: "#22C55E" } }),
    designElement({ type: "shape", x: 1300, y: 760, width: 400, height: 160, style: { shape: "rounded", fill: "#F59E0B", stroke: "#FFFFFF", strokeWidth: 6 } }),
    designElement({ type: "table", x: 120, y: 760, width: 1000, height: 240, content: "Stage\tWhere\nLight\tThylakoid\nDark\tStroma", style: { fontFamily: "sans", fontSize: 32, color: "#E2E8F0", header: true, headerFill: "#22C55E", headerColor: "#0F172A", fill: "#1E293B", banded: true, bandFill: "#334155", stroke: "#475569", strokeWidth: 2, padding: 12, columns: [0.4, 0.6] } }),
  ] })] })
  const plan = buildPptxPlan(doc, { includeHidden: true })
  const pptx = new PptxGen()
  pptx.defineLayout(plan.layout)
  pptx.layout = plan.layout.name
  pptx.title = plan.title
  for (const slidePlan of plan.slides) {
    const slide = pptx.addSlide()
    slide.background = { color: slidePlan.background }
    for (const op of slidePlan.ops) {
      if (op.kind === "text") slide.addText(op.text, op.options as never)
      else if (op.kind === "shape") slide.addShape(op.shape as never, op.options as never)
      else if (op.kind === "table") slide.addTable(op.rows as never, op.options as never)
    }
  }
  const { design, warnings } = await importPptxDesign(await pptx.write({ outputType: "uint8array" }) as Uint8Array)
  assert.deepEqual(warnings, [])
  assert.deepEqual([design.name, design.format, design.pages[0].background], ["Round trip", "presentation", "#0F172A"])
  const look = (element: CanvasElement) => [element.type, Math.round(element.x), Math.round(element.y), Math.round(element.width), Math.round(element.height), element.content, element.style.fontFamily, element.style.fontSize, element.style.color, element.style.list, element.style.shape, element.style.fill, element.style.stroke, element.style.strokeWidth]
  assert.deepEqual(design.pages[0].elements.map(look), doc.pages[0].elements.map(look))
  const tableLook = (element: CanvasElement) => {
    const table = readTableStyle(element)
    return [table.font, table.size, table.weight, table.color, table.align, table.verticalAlign, table.padding, table.header, table.headerFill, table.headerColor, table.fill, table.banded, table.bandFill, table.stroke, table.strokeWidth, element.style.columns]
  }
  assert.deepEqual(tableLook(design.pages[0].elements[4]), tableLook(doc.pages[0].elements[4]), "a table keeps its header, bands, lines, spacing and column widths")
})

test("PowerPoint fonts map to the nearest design font", () => {
  assert.equal(designFontFor("Arial"), "sans")
  assert.equal(designFontFor("Calibri"), "sans")
  assert.equal(designFontFor("Courier New"), "mono")
  assert.equal(designFontFor("Times New Roman"), "lora")
  assert.equal(designFontFor("Open Sans"), "sans", "a sans with serif-like words stays sans")
  assert.equal(designFontFor("Playfair Display"), "playfair")
  assert.equal(designFontFor("Impact"), "anton")
  assert.equal(designFontFor("Poppins"), "poppins")
})

test("PowerPoint import refuses broken files the way the text importer does", async () => {
  await assert.rejects(importPptxDesign(deck({ "ppt/presentation.xml": "<p:presentation><p:sldIdLst/></p:presentation>" })), /no slides/)
  await assert.rejects(importPptxDesign(deck({ "ppt/_rels/presentation.xml.rels": relationships(relation("rIdA", "slide", "../../outside.xml")) })), /slide 1 has no valid slide relationship/)
})

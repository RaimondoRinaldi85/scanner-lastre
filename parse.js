// Sticker rules for slab labels, run on the phone without internet.
// Input: text recognised from the label photo. Output: the fields the app fills in.
(function (root) {
  "use strict";

  // Lines that are logos, slogans or headings, never the material name.
  const NOT_MATERIAL = /NEO ?L[I1]TH|NEOLIIH|SURFACES|DEKTON|DESIGNED|COSENTINO|\bEAN\b|\bCODE\b|MADE IN|SPAIN|ESPANA|POLIGONO|INDUSTRIAL|^(MM|MAT|POL)$/;

  function normColor(s, b8 = true) {
    const c = String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    return b8 ? c.replace(/B/g, "8") : c;
  }
  function normCode(s) { return String(s || "").replace(/\D/g, ""); }
  function normDepth(s) { const m = String(s ?? "").match(/\d+(?:[.,]\d+)?/); return m ? m[0].replace(",", ".") : ""; }
  function normMaterial(s) { return String(s || "").replace(/\s+/g, " ").trim().toUpperCase(); }
  function codeOk(c) { return c.length >= 6 && c.length <= 20; }
  function combo(code, color) { return code && color ? code + "-" + color : (code || ""); }
  // "TAJ MAHAL SILK" -> "Taj Mahal Silk"; words without vowels are abbreviations: "BDK ETER" -> "BDK Eter".
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/\p{L}+/gu, w => /[aeiouyàèéìòù]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase());
  }

  function brandOf(text) {
    // Neolith's logo is stylised and often unreadable, but its factory address is printed on every label.
    if (/NEO\s?L[I1L]TH|NEOLIIH|ALMAZORA|ALNRAZORA|POLIGONO|CAMI FON/.test(text)) return "NEOLITH";
    if (/DEKTON|COSENTINO|\bBDK\b/.test(text)) return "DEKTON";
    return "";
  }

  // Serial number length per brand: Neolith 12 digits, Dekton 10. EAN product codes (13 digits) never count.
  function pickCode(cands, brand) {
    const want = brand === "NEOLITH" ? [12] : brand === "DEKTON" ? [10] : [12, 10];
    for (const n of want) {
      const hits = cands.filter(c => c.length === n);
      if (hits.length) {
        // The serial number is printed more than once: take the most frequent reading.
        const count = {};
        for (const h of hits) count[h] = (count[h] || 0) + 1;
        return Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      }
    }
    return cands.find(c => c.length !== 13) || "";
  }

  function parseLabel(text) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const up = lines.map(l => l.toUpperCase());
    const all = up.join("\n");
    const out = { brand: brandOf(all), material: "", depth: "", code: "", codes: [], color: "", size: "" };

    // Size and thickness. Dekton: "322x145x2" in cm, the last number is the thickness (2 -> 20 mm).
    const dk = all.match(/(\d{3})\s*[X×*]\s*(\d{3})\s*[X×*]\s*(\d(?:[.,]\d)?)(?!\d)/);
    const nl = all.match(/(?<!\d)(\d{4})\s*[X×*]\s*(\d{4})(?!\d)/);
    if (dk) {
      out.size = `${dk[1]}x${dk[2]}x${dk[3]}`;
      out.depth = String(Math.round(parseFloat(dk[3].replace(",", ".")) * 10));
    } else if (nl) out.size = `${nl[1]}X${nl[2]}`;
    const mm = all.match(/(?<!\d)(\d{1,2})\s*MM?\b/);   // "12MM", also "12M" when the last M is lost
    if (!out.depth && mm && +mm[1] >= 3 && +mm[1] <= 40) out.depth = mm[1];

    // Color. Dekton: "BDK-B-200-MAT" -> "B200" (dashes are often lost: "BDK-B200MAT"). Neolith: last line "12MM   51B" -> "51B".
    const dc = all.match(/\bBDK\s*-\s*([A-Z])\s*-?\s*(\d{3})/) || all.match(/\b[A-Z]{2,4}\s*-\s*([A-Z])\s*-\s*(\d{2,4})\b/);
    const nc = [...all.matchAll(/(?<!\d)\d{1,2}\s*MM\s+([0-9A-Z]{2,4})\b/g)].map(m => m[1]).filter(t => /\d/.test(t) && /^\d{1,3}[A-Z0-9]?$/.test(t));
    if (dc) out.color = dc[1] + dc[2];
    else if (nc.length) out.color = nc[nc.length - 1];

    // Serial number candidates: runs of 6-20 digits (spaces inside allowed), not part of dates or sizes.
    const cands = [];
    for (const m of all.matchAll(/(?<![\d/:.-])(\d(?:[ ]?\d){5,19})(?![\d/:.])/g)) cands.push(m[1].replace(/ /g, ""));
    out.codes = cands.filter(codeOk);
    out.code = pickCode(out.codes, out.brand);

    // Material. Dekton names start with "BDK" ("BDK ETER"). Otherwise: the first all-capital line of letters,
    // joined with the next one when that is also a name ("TAJ MAHAL" + "SILK").
    const bdk = all.match(/\bBDK ([A-Z]{3,}(?: [A-Z]{3,})?)\b/);
    if (bdk) out.material = "BDK " + bdk[1];
    // minLen: a name needs 5+ letters to start, but its second line can be short ("SILK").
    const isName = (i, minLen = 5) => {
      const l = lines[i];
      if (!l || l !== l.toUpperCase()) return false;            // the address line has lower-case letters
      if (!/^[A-ZÀ-Ý][A-ZÀ-Ý '.&-]{1,40}$/.test(l)) return false; // letters only
      const u = l.replace(/[.'-]/g, " ").replace(/\s+/g, " ").trim();
      return u.replace(/ /g, "").length >= minLen && /[A-Z]{3,}/.test(u) && !NOT_MATERIAL.test(u) && !/\bMM\b/.test(u) && !looksLikeLogo(u);
    };
    // On Neolith labels the name comes after the factory address: start looking there when the address was read.
    const addr = up.findIndex(l => /POLIGONO|ALMAZORA|ALNRAZORA|CASTELL/.test(l));
    for (let i = addr + 1; !out.material && i < lines.length; i++) {
      if (!isName(i)) continue;
      let name = lines[i];
      if (out.brand !== "DEKTON" && isName(i + 1, 3) && name.split(" ").length < 4) name += " " + lines[i + 1];
      out.material = normMaterial(name);
    }
    return out;
  }

  // A misread logo word ("SURIAES" for "SURFACES") is not a material either.
  const LOGO_WORDS = ["NEOLITH", "SURFACES", "DEKTON", "DESIGNED", "COSENTINO", "INDUSTRIAL", "POLIGONO"];
  function looksLikeLogo(line) {
    const words = line.split(" ").filter(w => w.length >= 4);
    return words.length > 0 && words.every(w => LOGO_WORDS.some(l => lev(w, l) <= Math.max(2, Math.floor(l.length * 0.4))));
  }

  // Several readings of the same label (different reading modes) vote field by field.
  function merge(passes, known) {
    const vote = key => {
      const c = new Map();
      for (const p of passes) if (p[key]) c.set(p[key], (c.get(p[key]) || 0) + 1);
      let best = "", n = 0;
      for (const [v, k] of c) if (k > n) { best = v; n = k; }
      return best;
    };
    const brand = vote("brand");
    const codes = passes.flatMap(p => p.codes);
    const out = { brand, material: vote("material"), depth: vote("depth"), color: vote("color"), size: vote("size"), codes, code: pickCode(codes, brand) };
    const k = matchKnown(passes.map(p => p.text || "").join("\n"), known || []);
    if (k) out.material = k;
    return out;
  }

  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // A material already used on this phone, found in the label text even with small reading errors ("SIL" -> "SILK").
  function matchKnown(text, known) {
    const words = [...new Set(String(text).toUpperCase().match(/[A-Z]{3,}/g) || [])];
    let best = "", bestScore = 0;
    for (const m of known) {
      const mw = m.split(/\s+/).filter(w => w.length >= 3);
      if (!mw.length) continue;
      const hit = mw.filter(w => words.some(x => x === w || (Math.abs(x.length - w.length) <= 1 && lev(x, w) <= 1))).length;
      const score = hit / mw.length + mw.length * 0.01; // prefer the longer name on a tie
      if (hit / mw.length >= 0.66 && score > bestScore) { best = m; bestScore = score; }
    }
    return best;
  }

  // How useful a reading is: used to pick the right rotation of the photo.
  function score(p) { return (p.code ? 3 : 0) + (p.depth ? 1 : 0) + (p.color ? 1 : 0) + (p.material ? 1 : 0); }

  const api = { parseLabel, merge, matchKnown, score, pickCode, brandOf, normColor, normCode, normDepth, normMaterial, codeOk, combo, titleCase };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Parse = api;
})(typeof self !== "undefined" ? self : this);

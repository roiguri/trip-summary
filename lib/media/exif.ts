// The photo's own local time offset, from its EXIF (OffsetTimeOriginal, "+03:00"): the first choice
// for a photo's local time (docs/DATA-DESIGN.md, "Photos"). A small reader for just this tag.

/** Minutes east of UTC, or null if the JPEG carries no offset. */
export function exifOffset(jpeg: Buffer): number | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let o = 2;
  while (o + 4 < jpeg.length) {
    if (jpeg[o] !== 0xff) return null;
    const marker = jpeg[o + 1];
    const len = jpeg.readUInt16BE(o + 2);
    if (marker === 0xe1 && jpeg.toString('latin1', o + 4, o + 10) === 'Exif\0\0')
      return fromTiff(jpeg.subarray(o + 10, o + 2 + len));
    if (marker === 0xda) return null; // image data starts: no EXIF before it
    o += 2 + len;
  }
  return null;
}

function fromTiff(t: Buffer): number | null {
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (p: number) => (le ? t.readUInt16LE(p) : t.readUInt16BE(p));
  const u32 = (p: number) => (le ? t.readUInt32LE(p) : t.readUInt32BE(p));
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    if (ifd + 2 > t.length) return out;
    for (let i = 0, n = u16(ifd); i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 });
    }
    return out;
  };
  const ifd0 = entries(u32(4));
  const exifPtr = ifd0.get(0x8769);
  if (!exifPtr) return null;
  const tag = entries(u32(exifPtr.at)).get(0x9011) ?? entries(u32(exifPtr.at)).get(0x9010);
  if (!tag || tag.type !== 2) return null;
  const at = tag.count > 4 ? u32(tag.at) : tag.at;
  const m = t.toString('latin1', at, at + tag.count).match(/^([+-])(\d\d):(\d\d)/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

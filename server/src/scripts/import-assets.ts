import ExcelJS from 'exceljs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { upsertAssetRows, type AssetRow } from '../routes/admin/assets.js';

/** "디바이스(S패드:SM-T500)" → "SM-T500". 콜론이 없으면 원본 트림 값을 그대로 사용. */
export function parseModel(assetName: string | undefined | null): string | undefined {
  if (!assetName) return undefined;
  const trimmed = String(assetName).trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/:([^)]*)\)/);
  if (match) return match[1].trim() || undefined;
  return trimmed;
}

function cellText(cell: unknown): string | undefined {
  if (cell === null || cell === undefined) return undefined;
  let v: unknown = cell;
  if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
    v = (v as { text: unknown }).text;
  } else if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
    v = (v as { result: unknown }).result;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

export async function readAssetRows(filePath: string): Promise<AssetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('pad');
  if (!sheet) throw new Error(`sheet "pad" not found in ${filePath}`);

  const rows: AssetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    // 열 순서: 자산명, 자산번호, SAP번호, 제조번호(시리얼), 소유자, 사번,
    //          조직1명, 조직2명, 위치정보, 상태, 비고, 지급일, 최초생성일(무시)
    const assetName = cellText(row.getCell(1).value);
    const assetNo = cellText(row.getCell(2).value);
    const sapNo = cellText(row.getCell(3).value);
    const serial = cellText(row.getCell(4).value);
    const ownerName = cellText(row.getCell(5).value);
    const ownerEmpNo = cellText(row.getCell(6).value);
    const org1 = cellText(row.getCell(7).value);
    const org2 = cellText(row.getCell(8).value);
    const location = cellText(row.getCell(9).value);
    const status = cellText(row.getCell(10).value);
    const note = cellText(row.getCell(11).value);
    const issuedAt = cellText(row.getCell(12).value);
    // 13번째 컬럼(최초생성일)은 무시한다.

    if (!serial) return; // 시리얼 없는 행은 스킵

    rows.push({
      serial,
      assetNo,
      sapNo,
      model: parseModel(assetName),
      ownerName,
      ownerEmpNo,
      org1,
      org2,
      location,
      status,
      issuedAt,
      note,
    });
  });
  return rows;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: tsx server/src/scripts/import-assets.ts <path-to-xlsx>');
    process.exit(1);
  }
  const config = loadConfig();
  const { db, close } = createDb(config.DATABASE_URL);
  try {
    const rows = await readAssetRows(filePath);
    const result = await upsertAssetRows(db, rows);
    console.log(`imported ${result.upserted} asset rows from ${filePath}`);
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

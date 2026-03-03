/**
 * upload-pdfs.mjs
 * 
 * [1회만 실행] Gemini File API에 PDF를 업로드하고 file URI를 출력하는 스크립트.
 * 출력된 URI를 Supabase Edge Function 환경변수(MANUAL_1_URI, MANUAL_2_URI)에 저장하세요.
 * 
 * 사용법:
 *   npm install @google/generative-ai
 *   GEMINI_API_KEY=your_key node upload-pdfs.mjs
 */

import { GoogleAIFileManager } from "@google/generative-ai/server";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY 환경변수를 설정해주세요.");
  console.error("   예: GEMINI_API_KEY=your_key node upload-pdfs.mjs");
  process.exit(1);
}

const fileManager = new GoogleAIFileManager(API_KEY);

async function uploadAndWait(filePath, displayName) {
  console.log(`\n📤 ${displayName} 업로드 중...`);

  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: "application/pdf",
    displayName,
  });

  let file = await fileManager.getFile(uploadResult.file.name);

  while (file.state === "PROCESSING") {
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
    file = await fileManager.getFile(uploadResult.file.name);
  }

  if (file.state !== "ACTIVE") {
    throw new Error(`파일 처리 실패: ${file.name} (state: ${file.state})`);
  }

  console.log(`\n✅ ${displayName} 처리 완료!`);
  console.log(`   URI: ${file.uri}`);
  console.log(`   Name: ${file.name}`);
  console.log(`   MimeType: ${file.mimeType}`);

  return file;
}

async function main() {
  try {
    // ⚠️ 실제 PDF 파일 경로로 수정하세요
    const manual1 = await uploadAndWait(
      "./pdfs/교무업무_매뉴얼.pdf",
      "교무업무_매뉴얼"
    );

    const manual2 = await uploadAndWait(
      "./pdfs/학교관리자_매뉴얼.pdf",
      "학교관리자_매뉴얼"
    );

    console.log("\n" + "=".repeat(60));
    console.log("📋 아래 URI를 Supabase 환경변수에 저장하세요:");
    console.log("=".repeat(60));
    console.log(`MANUAL_1_URI=${manual1.uri}`);
    console.log(`MANUAL_2_URI=${manual2.uri}`);
    console.log("=".repeat(60));
    console.log("\n💡 Supabase CLI에서 설정:");
    console.log(`   supabase secrets set MANUAL_1_URI="${manual1.uri}"`);
    console.log(`   supabase secrets set MANUAL_2_URI="${manual2.uri}"`);

    // ⚠️ Gemini File API의 파일은 48시간 후 자동 삭제됩니다.
    // 프로덕션에서는 서버 시작 시 또는 cron으로 주기적 재업로드 로직이 필요합니다.
    console.log("\n⚠️  주의: Gemini File API 파일은 48시간 후 만료됩니다.");
    console.log("   프로덕션에서는 주기적 재업로드 로직을 구성하세요.");
  } catch (error) {
    console.error("❌ 오류:", error.message);
  }
}

main();

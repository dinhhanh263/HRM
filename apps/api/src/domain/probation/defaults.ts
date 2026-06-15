import { Prisma, type PrismaClient } from '@prisma/client';
import { ProbationCompetencyGroup, type ProbationRubricLevel } from '@hrm/shared';

// Nhãn 5 mức dùng chung cho mọi rubric (BARS — neo bằng hành vi quan sát được).
// Điểm 1..5 ánh xạ thẳng sang thang chấm scorecard SPEC-030.
const LEVEL_LABELS: Record<number, string> = {
  1: 'Chưa đạt',
  2: 'Cần cải thiện',
  3: 'Đạt kỳ vọng',
  4: 'Trên kỳ vọng',
  5: 'Xuất sắc',
};

// Helper dựng 5 mức rubric từ định nghĩa + biểu hiện quan sát của từng năng lực.
function rubric(
  anchors: Record<number, { definition: string; observable: string }>,
): ProbationRubricLevel[] {
  return [1, 2, 3, 4, 5].map((score) => ({
    score,
    level: LEVEL_LABELS[score],
    definition: anchors[score].definition,
    observable: anchors[score].observable,
  }));
}

interface DefaultCriterion {
  name: string;
  order: number;
  group: ProbationCompetencyGroup;
  rubric: ProbationRubricLevel[];
}

// Bộ 6 năng lực mặc định, cập nhật từ thực tiễn 2025–2026 của các công ty lớn
// (Google GRAD/Googleyness, Amazon LP, Netflix Keeper Test, Meta PSC, Microsoft 3
// vòng tròn impact, Atlassian). Tách What (PERFORMANCE) khỏi How (VALUES). HR có thể
// sửa/deactivate hoặc thêm tiêu chí riêng qua tab cấu hình.
export const DEFAULT_PROBATION_CRITERIA: DefaultCriterion[] = [
  {
    name: 'Chuyên môn & Tốc độ hòa nhập',
    order: 0,
    group: ProbationCompetencyGroup.PERFORMANCE,
    rubric: rubric({
      1: {
        definition: 'Thiếu kiến thức nền cho vị trí, hòa nhập rất chậm.',
        observable: 'Không nắm được công cụ/quy trình cơ bản dù đã được hướng dẫn nhiều lần.',
      },
      2: {
        definition: 'Có kiến thức nền nhưng cần kèm cặp sát để áp dụng.',
        observable: 'Hoàn thành việc quen thuộc khi có người chỉ dẫn từng bước.',
      },
      3: {
        definition: 'Nắm vững chuyên môn cốt lõi, hòa nhập đúng tiến độ kỳ vọng.',
        observable: 'Tự xử lý phần lớn công việc thường ngày sau giai đoạn onboarding.',
      },
      4: {
        definition: 'Chuyên môn vững, hòa nhập nhanh hơn kỳ vọng giai đoạn thử việc.',
        observable: 'Chủ động vận dụng kiến thức vào việc mới, ít cần hỗ trợ.',
      },
      5: {
        definition: 'Chuyên môn xuất sắc, hòa nhập gần như tức thì và lan tỏa.',
        observable: 'Trở thành nguồn tham khảo cho đồng đội ngay trong thời gian thử việc.',
      },
    }),
  },
  {
    name: 'Chất lượng công việc',
    order: 1,
    group: ProbationCompetencyGroup.PERFORMANCE,
    rubric: rubric({
      1: {
        definition: 'Kết quả thường có lỗi, phải làm lại nhiều.',
        observable: 'Sản phẩm bàn giao thường xuyên bị trả lại để sửa.',
      },
      2: {
        definition: 'Đạt yêu cầu cơ bản nhưng còn lỗi cần nhắc.',
        observable: 'Cần người khác rà soát mới phát hiện và sửa sai sót.',
      },
      3: {
        definition: 'Chất lượng ổn định, đáp ứng tiêu chuẩn đề ra.',
        observable: 'Bàn giao đúng yêu cầu với số lỗi ở mức chấp nhận được.',
      },
      4: {
        definition: 'Chất lượng cao, chú trọng chi tiết hơn kỳ vọng.',
        observable: 'Tự kiểm tra kỹ, hiếm khi để lọt lỗi xuống khâu sau.',
      },
      5: {
        definition: 'Đặt và giữ tiêu chuẩn cao, là chuẩn mực cho nhóm.',
        observable: 'Đề xuất cải tiến nâng chất lượng chung của cả nhóm.',
      },
    }),
  },
  {
    name: 'Chủ động & Sở hữu công việc',
    order: 2,
    group: ProbationCompetencyGroup.PERFORMANCE,
    rubric: rubric({
      1: {
        definition: 'Thụ động, chỉ làm khi được giao và nhắc.',
        observable: 'Bỏ mặc vấn đề phát sinh nếu không được phân công cụ thể.',
      },
      2: {
        definition: 'Làm tròn việc được giao nhưng ít tự đề xuất.',
        observable: 'Hoàn thành nhiệm vụ rồi dừng, chờ chỉ dẫn tiếp theo.',
      },
      3: {
        definition: 'Chủ động nhận việc và theo tới khi xong.',
        observable: 'Tự nêu vấn đề và đề xuất hướng xử lý ở mức công việc của mình.',
      },
      4: {
        definition: 'Sở hữu kết quả, chủ động mở rộng phạm vi giúp nhóm.',
        observable: 'Tự nhận thêm việc khó và chịu trách nhiệm tới cùng.',
      },
      5: {
        definition: 'Tinh thần làm chủ rõ rệt, dẫn dắt giải quyết vấn đề.',
        observable: 'Đứng ra điều phối xử lý sự cố vượt phạm vi cá nhân.',
      },
    }),
  },
  {
    name: 'Giao tiếp & Phối hợp',
    order: 3,
    group: ProbationCompetencyGroup.PERFORMANCE,
    rubric: rubric({
      1: {
        definition: 'Giao tiếp gây hiểu nhầm, ngại phối hợp.',
        observable: 'Ít cập nhật tiến độ, gây vướng cho người liên quan.',
      },
      2: {
        definition: 'Giao tiếp được nhưng chưa rõ ràng, cần nhắc cập nhật.',
        observable: 'Trả lời khi được hỏi nhưng ít chủ động thông tin.',
      },
      3: {
        definition: 'Giao tiếp rõ ràng, phối hợp tốt trong nhóm.',
        observable: 'Cập nhật tiến độ đều đặn, trao đổi đúng người đúng lúc.',
      },
      4: {
        definition: 'Giao tiếp mạch lạc, chủ động kết nối nhiều bên.',
        observable: 'Làm cầu nối thông tin giữa các thành viên, giảm hiểu nhầm.',
      },
      5: {
        definition: 'Truyền đạt thuyết phục, nâng chất lượng phối hợp chung.',
        observable: 'Hỗ trợ đồng đội diễn đạt và đồng thuận trong các cuộc trao đổi khó.',
      },
    }),
  },
  {
    name: 'Thích nghi & Học hỏi',
    order: 4,
    group: ProbationCompetencyGroup.PERFORMANCE,
    rubric: rubric({
      1: {
        definition: 'Khó thích nghi, lặp lại sai sót sau góp ý.',
        observable: 'Phản ứng tiêu cực với thay đổi hoặc phản hồi.',
      },
      2: {
        definition: 'Tiếp thu chậm, cần lặp lại góp ý nhiều lần.',
        observable: 'Áp dụng phản hồi nhưng không nhất quán.',
      },
      3: {
        definition: 'Tiếp thu phản hồi và điều chỉnh hợp lý.',
        observable: 'Sửa sai sau góp ý và ít lặp lại lỗi cũ.',
      },
      4: {
        definition: 'Học nhanh, chủ động tìm hiểu cái mới.',
        observable: 'Tự trang bị kỹ năng còn thiếu mà không cần thúc giục.',
      },
      5: {
        definition: 'Học hỏi rất nhanh, biến phản hồi thành cải tiến.',
        observable: 'Chia sẻ lại kiến thức mới học cho đồng đội.',
      },
    }),
  },
  {
    name: 'Phù hợp văn hóa & Giá trị',
    order: 5,
    group: ProbationCompetencyGroup.VALUES,
    rubric: rubric({
      1: {
        definition: 'Hành vi đi ngược giá trị cốt lõi của công ty.',
        observable: 'Gây ảnh hưởng tiêu cực tới tinh thần làm việc của nhóm.',
      },
      2: {
        definition: 'Chưa thực sự hòa hợp với văn hóa nhóm.',
        observable: 'Tham gia hời hợt vào hoạt động và chuẩn mực chung.',
      },
      3: {
        definition: 'Tôn trọng và sống đúng giá trị, hòa hợp với nhóm.',
        observable: 'Ứng xử nhất quán với chuẩn mực và tinh thần đồng đội.',
      },
      4: {
        definition: 'Lan tỏa giá trị tích cực trong nhóm.',
        observable: 'Chủ động hỗ trợ đồng đội, góp phần xây dựng môi trường tốt.',
      },
      5: {
        definition: 'Hình mẫu sống giá trị, truyền cảm hứng cho người khác.',
        observable: 'Được đồng đội xem là tấm gương về văn hóa và thái độ.',
      },
    }),
  },
];

/**
 * Idempotently seed the default probation criteria for a tenant. Criteria have
 * no natural unique key, so we seed only when the tenant has none yet — existing
 * tenants (SPEC-030) keep their current criteria untouched.
 */
export async function seedProbationCriteriaForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.probationCriteria.count({ where: { tenantId } });
  if (existing > 0) return;

  await prisma.probationCriteria.createMany({
    data: DEFAULT_PROBATION_CRITERIA.map((def) => ({
      tenantId,
      name: def.name,
      order: def.order,
      isActive: true,
      group: def.group,
      rubric: def.rubric as unknown as Prisma.InputJsonValue,
    })),
  });
}

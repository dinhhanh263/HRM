import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import type { ProbationReviewDto } from '@hrm/shared';
import { ProbationReviewList } from './ProbationReviewList';

// SPEC-034 §4 — landing on /probation?employee=<id> (from a dashboard event)
// must drop the user straight into the action: the open review's scorecard if
// one exists, otherwise the create dialog with the employee preselected.

let mockPermissions: string[] = [];
let mockReviews: ProbationReviewDto[] = [];

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = {
      user: {
        id: 'u-mgr',
        fullName: 'Manager',
        email: 'm@e.com',
        permissions: mockPermissions,
        employee: { id: 'emp-mgr' },
      },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../hooks/useProbation', () => ({
  useProbationReviews: () => ({ data: { data: mockReviews }, isLoading: false }),
  useCreateProbationReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/employees/hooks/useEmployees', () => ({
  useEmployees: () => ({
    data: {
      data: [
        { id: 'emp-prob', fullName: 'Nguyễn Văn A', employeeCode: 'NV-001' },
        { id: 'emp-other', fullName: 'Trần Thị B', employeeCode: 'NV-002' },
      ],
    },
    isLoading: false,
  }),
}));

// The real sheet pulls criteria/guidelines; a stub that surfaces which review
// it was opened for is all this behaviour needs.
vi.mock('./ProbationScorecardSheet', () => ({
  ProbationScorecardSheet: ({
    review,
    open,
  }: {
    review: ProbationReviewDto | null;
    open: boolean;
  }) => (open && review ? <div data-testid="scorecard-sheet">{review.employee.id}</div> : null),
}));

function makeReview(over: Partial<ProbationReviewDto> = {}): ProbationReviewDto {
  return {
    id: 'rev-1',
    tenantId: 't-1',
    employee: {
      id: 'emp-prob',
      fullName: 'Nguyễn Văn A',
      employeeCode: 'NV-001',
      avatar: null,
      departmentName: null,
      positionName: null,
      probationEndDate: '2026-06-15',
    },
    status: 'DRAFT',
    reviewer: null,
    selfRatings: null,
    selfComment: null,
    selfSubmittedAt: null,
    ratings: null,
    deliverables: null,
    strengths: null,
    weaknesses: null,
    comment: null,
    recommendation: null,
    submittedAt: null,
    decidedBy: null,
    decision: null,
    decisionNote: null,
    decidedAt: null,
    newProbationEndDate: null,
    probationEndDateAtCreate: '2026-06-15',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('ProbationReviewList — /probation?employee deep-link (SPEC-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['probation:view', 'probation:review'];
    mockReviews = [];
  });

  it('opens the create dialog preselected when the employee has no open review', async () => {
    window.history.pushState({}, '', '/probation?employee=emp-prob');
    render(<ProbationReviewList />);

    await waitFor(() => {
      expect(screen.getByText('Tạo đánh giá thử việc')).toBeInTheDocument();
    });
    // Radix Select trigger shows the preselected candidate.
    expect(screen.getByRole('combobox', { name: '' })).toHaveTextContent('Nguyễn Văn A');
    // The param is consumed: closing the dialog must not re-trigger.
    expect(window.location.search).toBe('');
  });

  it('opens the scorecard sheet when the employee already has an open review', async () => {
    mockReviews = [makeReview({ status: 'DRAFT' })];
    window.history.pushState({}, '', '/probation?employee=emp-prob');
    render(<ProbationReviewList />);

    await waitFor(() => {
      expect(screen.getByTestId('scorecard-sheet')).toHaveTextContent('emp-prob');
    });
    expect(screen.queryByText('Tạo đánh giá thử việc')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('ignores decided/cancelled reviews and offers a fresh create instead', async () => {
    mockReviews = [makeReview({ status: 'DECIDED', decision: 'EXTEND' })];
    window.history.pushState({}, '', '/probation?employee=emp-prob');
    render(<ProbationReviewList />);

    await waitFor(() => {
      expect(screen.getByText('Tạo đánh giá thử việc')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('scorecard-sheet')).not.toBeInTheDocument();
  });

  it('does nothing without probation:review when there is no open review', async () => {
    mockPermissions = ['probation:view'];
    window.history.pushState({}, '', '/probation?employee=emp-prob');
    render(<ProbationReviewList />);

    await waitFor(() => {
      // Param still consumed, but no dialog the user can't act on.
      expect(window.location.search).toBe('');
    });
    expect(screen.queryByText('Tạo đánh giá thử việc')).not.toBeInTheDocument();
  });

  it('does not open anything without the query param', () => {
    window.history.pushState({}, '', '/probation');
    render(<ProbationReviewList />);

    expect(screen.queryByText('Tạo đánh giá thử việc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scorecard-sheet')).not.toBeInTheDocument();
  });
});

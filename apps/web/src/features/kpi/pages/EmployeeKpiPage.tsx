import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useEmployeeKpiHistory } from '../hooks/useKpiConfig';
import { EmployeeKpiDashboard } from '../components/EmployeeKpiDashboard';

export function EmployeeKpiPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { t } = useTranslation('kpi');
  const navigate = useNavigate();
  const { data, isLoading } = useEmployeeKpiHistory(employeeId);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
        <ChevronLeft size={15} />{t('cycle.backToList')}
      </button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data?.employeeName ?? t('me.memberTitle')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('me.memberSubtitle')}</p>
      </div>
      <EmployeeKpiDashboard history={data} isLoading={isLoading} />
    </div>
  );
}

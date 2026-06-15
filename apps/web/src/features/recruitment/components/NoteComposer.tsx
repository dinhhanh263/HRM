import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useCreateApplicationNote } from '../hooks/useApplications';

interface NoteComposerProps {
  applicationId: string;
}

export function NoteComposer({ applicationId }: NoteComposerProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const [body, setBody] = useState('');
  const createNote = useCreateApplicationNote(applicationId);

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    createNote.mutate(
      { body: trimmed },
      {
        onSuccess: () => setBody(''),
        onError: () => toast.error(t('activity.note.error')),
      }
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={t('activity.note.placeholder')}
        aria-label={t('activity.note.label')}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!body.trim() || createNote.isPending}
        >
          <Send size={14} className="mr-1.5" />
          {createNote.isPending ? tc('states.saving') : t('activity.note.submit')}
        </Button>
      </div>
    </div>
  );
}

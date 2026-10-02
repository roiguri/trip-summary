import { Notice } from '../../components/Notice';

const MESSAGES: Record<string, [string, string]> = {
  'other-device': [
    'This link was opened on another device',
    'Each link works on one device. Ask the person who shared the trip for a new link for this one.',
  ],
  revoked: [
    'This link no longer works',
    'The person who shared the trip turned it off. Ask them for a new one.',
  ],
  'not-published': [
    'This trip isn’t shared yet',
    'Try the link again once the person who sent it has published the trip.',
  ],
};

export default async function InviteProblem({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const [title, text] = MESSAGES[reason ?? ''] ?? [
    'This link doesn’t work',
    'Check that the whole link was copied, or ask for a new one.',
  ];
  return (
    <Notice title={title}>
      <p>{text}</p>
    </Notice>
  );
}

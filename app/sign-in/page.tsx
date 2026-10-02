import { redirect } from 'next/navigation';
import { Notice } from '../components/Notice';
import { SignInButton } from './SignInButton';
import { currentAccount } from '../../lib/auth/session';
import { safeNext } from '../../lib/auth/access';

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  return (
    <Notice title="Sign in to your journeys">
      <p>
        Editors sign in with Google. If someone shared a trip with you, open the link they sent on
        this device.
      </p>
      <SignInButton next={next} />
    </Notice>
  );
}

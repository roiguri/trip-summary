import { getTrip } from '../lib/data';
import Client from './Client';

// Read the database on every request so re-seeding shows up without a rebuild.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <Client trip={getTrip()} />;
}

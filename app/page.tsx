import { getTrip } from '../lib/data';
import Client from './Client';
export default function Page() {
  return <Client trip={getTrip()} />;
}

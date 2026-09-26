// Rebuilds the local database from a trip data file.
// Usage: npm run seed [data-file]   (default: data/sample-trip.json; database: $TRIP_DB or trip-sample.db)
import { DB_FILE, DEFAULT_DATA_FILE, seed } from '../lib/db.ts';

const file = process.argv[2] ?? DEFAULT_DATA_FILE;
seed(file).close();
console.log(`Seeded ${DB_FILE} from ${file}`);

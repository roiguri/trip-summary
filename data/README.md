# Trip data files

The app renders whatever trip is current in the local SQLite database. The code holds no trip-specific values. A trip is described by one JSON file and loaded with:

```sh
npm run seed                                 # data/sample-trip.json -> trip-sample.db
npm run seed -- data/fixtures/test-trip.json # any other trip file
TRIP_DB=/tmp/other.db npm run seed -- file.json   # into a different database
```

Seeding replaces the database. The page reads the database on every request, so reload after seeding and don't rebuild. `npm run dev` seeds the sample automatically if no database exists.

- `sample-trip.json`: the fictional Carmel/Monterey sample the design was locked against.
- `fixtures/test-trip.json`: a small, deliberately different trip (other dates, timezone, day count, span placement, transit mode). It checks that the UI has no sample-specific code.

Never commit real trip data or photos. Real data files belong outside the repo, or under a git-ignored path.

## Format

| Key           | Maps to                                                   | Notes                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination` | `destinations`                                            | `timezone` (IANA) drives times and zone labels; `lat`/`lng` is the initial map centre.                                                                                                                                                                                                                                                                    |
| `trip`        | `trips`                                                   | `title` is the page heading; `subtitle` is stored in `trips.notes`. `start_date`/`end_date` define the days shown.                                                                                                                                                                                                                                        |
| `days[]`      | `days` (prototype table) + `itinerary` rows of type `tag` | Optional. `title` names the day album; `tags` are the small labels under the day banner.                                                                                                                                                                                                                                                                  |
| `places[]`    | `places`                                                  | `key` is referenced by itinerary entries. `category` becomes the byline/tag. Places with coordinates get numbered map pins.                                                                                                                                                                                                                               |
| `itinerary[]` | `itinerary`                                               | `type`: `place`, `lodging`, `transit` or `note`. `title` defaults to the place title. A place/note with `end_date` after `start_date` is drawn as a **multi-day span** (start block, later-day chips, end diamond at `end_time`). For lodging, `end_date` + `end_time` are the check-out. Transit uses `from_location`, `to_location` and the time zones. |
| `photos[]`    | `photos` (prototype table)                                | `entry` attaches a photo to an itinerary entry. Unattached photos become a single "moment" or an hourly cluster on their `date`. `lat`/`lng` shows a photo dot on the map.                                                                                                                                                                                |

Keys only link rows within one file; database IDs are generated.

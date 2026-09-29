# Visual regression tests

`npm run visual` screenshots the agreed states of the sample trip (verification Parts 1–13) at
1440×900 and compares them with `baseline/`. It runs in CI on every pull request.

- **A test fails:** CI uploads `visual-differences` (per state: `*.actual.png` and `*.diff.png` showing
  baseline | now | diff in red). Locally the same files land in `output/` (git-ignored).
- **The change is intended:** run `npm run visual:update` with the app running on the seeded sample
  trip, check the new images, and commit them with the change.
- **Baselines differ only by platform:** run the CI workflow by hand with "update baselines" and
  commit the `visual-baselines` artifact.

To be reproducible, the tests render text in Liberation Sans from `fonts/` (SIL Open Font License,
see `fonts/LICENSE`; it is the page's Arial fallback on Linux), hide the map's tile canvas (tiles load
from the internet; pins and markers stay), and turn off animations. A state fails when more than
0.1% of its pixels change.

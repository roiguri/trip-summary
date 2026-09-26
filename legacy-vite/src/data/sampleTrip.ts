/**
 * Fictional sample trip used by the "Load sample data" button.
 * All places/people/details are invented; it exists so the UI can be
 * explored without importing real data. Real trip data should never be
 * committed to this repository.
 */
import { Trip } from '../types';

export const sampleTrip: Trip = {
  id: 'trip-sample',
  name: 'Sample: Island Loop',
  startDate: '2026-04-03',
  endDate: '2026-04-05',
  updatedAt: '2026-04-05T20:00:00.000Z',
  days: [
    {
      date: '2026-04-03',
      title: 'Arrival',
      notes: 'Landed early, dropped bags, walked the harborfront at sunset.',
      highlight: false,
      photos: [
        { id: 'photo-s1', fileName: 'IMG_0001.jpg', description: 'Harbor at sunset', takenAt: '2026-04-03T09:20:00Z', favorite: true, source: 'google-photos' },
        { id: 'photo-s2', fileName: 'IMG_0002.jpg', takenAt: '2026-04-03T10:05:00Z', favorite: false, source: 'google-photos' },
      ],
      places: [
        { id: 'place-s1', name: 'Harborview Guesthouse', category: 'accommodation', highlight: false, source: 'google-maps', startTime: '2026-04-03T07:40:00Z' },
        { id: 'place-s2', name: 'Blue Lantern Noodle Bar', category: 'restaurant', recommendation: 'Hand-pulled noodles, go before 19:00 or queue.', rating: 4, highlight: true, source: 'notes' },
      ],
    },
    {
      date: '2026-04-04',
      title: 'Coastal trail',
      notes: 'Long hike day. Windy on the ridge.',
      highlight: true,
      photos: [
        { id: 'photo-s3', fileName: 'IMG_0003.jpg', description: 'Ridge view', takenAt: '2026-04-04T03:30:00Z', favorite: true, source: 'google-photos' },
      ],
      places: [
        { id: 'place-s3', name: 'Eagle Ridge Trailhead', category: 'attraction', recommendation: 'Start early, no shade after 10:00.', rating: 5, highlight: true, source: 'google-maps', startTime: '2026-04-04T01:10:00Z' },
        { id: 'place-s4', name: 'Salt & Stone Cafe', category: 'restaurant', rating: 3, highlight: false, source: 'notes' },
      ],
    },
    {
      date: '2026-04-05',
      title: 'Market morning, fly home',
      notes: '',
      highlight: false,
      photos: [],
      places: [
        { id: 'place-s5', name: 'Old Town Morning Market', category: 'activity', recommendation: 'Great fruit stalls; cash only.', highlight: false, source: 'notes' },
        { id: 'place-s6', name: 'City Airport', category: 'transport', highlight: false, source: 'google-maps', startTime: '2026-04-05T09:00:00Z' },
      ],
    },
  ],
};

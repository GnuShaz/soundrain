import { EnsureUserInput } from '../users/users.service';
import { TrackDto } from '../tracks/track.dto';

export interface LikeTrackDto extends EnsureUserInput {
  track: TrackDto;
}

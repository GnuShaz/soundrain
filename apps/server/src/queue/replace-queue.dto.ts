import { EnsureUserInput } from '../users/users.service';
import { TrackDto } from '../tracks/track.dto';

export interface ReplaceQueueDto extends EnsureUserInput {
  items: TrackDto[];
}

import { EnsureUserInput } from '../users/users.service';
import { PlaybackStateDto } from './playback-state.service';

export interface SavePlaybackStateDto extends EnsureUserInput, PlaybackStateDto {}

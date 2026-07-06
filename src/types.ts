export interface Member {
  id: string;
  name: string;
  avatar: string; // E.g. Pokemon emoji or avatar name / base64 image data
  gameId?: string; // Game ID/Number
  rating?: number; // MMR or rating for balance
  role?: string; // Carry, Mid, Offlane, Support, Soft Support, or comma-separated roles
  createdAt: number;
}

export interface GroupConfig {
  groupCount: number;
  peoplePerGroup: number;
  roundOrders: string[]; // E.g. ["1,2,3,4", "4,3,2,1"]
  gameType?: string;
}

export interface BoardState {
  candidateIds: string[];
  silentIds: string[];
  groups: { [groupIndex: number]: string[] }; // Map groupIndex -> array of memberIds
  currentPickIndex: number; // Current pick index in the flattened draft order
  pairings?: { [groupIdx: string]: number }; // Maps group index string -> pair design index (0 for A, 1 for B, etc.)
}

export interface FullState {
  members: Member[];
  config: GroupConfig;
  board: BoardState;
}

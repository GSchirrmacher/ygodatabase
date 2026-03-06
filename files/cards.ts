export interface CardStub {
  id: number;
  name: string;
  cardType: string;
  hasAltArt: number;
  imageId?: number;
  imgPath?: string;
  frameType?: string;
  rarities: (string | null)[];
  totalCollectionAmount: number;
}

export interface CardSetRarity {
  rarity?: string;
  collectionAmount?: number;
  setPrice?: number;
}

export interface CardSet {
  setCode?: string;
  setName?: string;
  rarities: CardSetRarity[];
}

export interface CardDetail {
  id: number;
  name: string;
  cardType: string;
  hasAltArt: number;
  imageId?: number;
  imgPath?: string;

  frameType?: string;
  attribute?: string;
  desc?: string;

  level?: number;
  atk?: number;
  def?: number;
  race?: string;
  scale?: number;
  linkval?: number;
  typeline?: string[];

  sets: CardSet[];
}

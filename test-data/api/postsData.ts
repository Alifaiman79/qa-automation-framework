export type PostPayload = {
  title: string;
  body: string;
  userId: number;
};

export const existingPostId = 1;
export const nonexistentPostId = 999_999;

export const createPostPayload: Readonly<PostPayload> = {
  title: 'Synthetic API test post',
  body: 'Synthetic content used to validate the create response.',
  userId: 5,
};

export const putPostPayload: Readonly<PostPayload> = {
  title: 'Synthetic API replacement post',
  body: 'Synthetic content used to validate the PUT response.',
  userId: 5,
};

export const patchPostPayload: Readonly<Pick<PostPayload, 'title'>> = {
  title: 'Synthetic API patched title',
};

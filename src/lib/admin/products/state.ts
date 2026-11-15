export type ActionState = {
  ok?: boolean;
  message?: string;
  /** Field name -> message (names match the form inputs). */
  errors?: Record<string, string>;
};

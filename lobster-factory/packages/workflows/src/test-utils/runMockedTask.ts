/**
 * Trigger.dev's production Task type intentionally hides the definition's `run` function.
 * Unit tests mock `task()` to return that definition object, so this is the single explicit
 * type boundary for invoking the mocked task without weakening production types.
 */
export function runMockedTask<TOutput>(
  mockedTask: unknown,
  payload: unknown
): Promise<TOutput> {
  const definition = mockedTask as {
    run: (input: unknown) => Promise<TOutput>;
  };
  return definition.run(payload);
}

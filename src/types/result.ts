/**
 * Result type for explicit error handling
 * Following TypeScript coding standards: no any types, explicit return types
 */

/**
 * Success result containing data
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Failure result containing error
 */
export interface Failure<E = Error> {
  success: false;
  error: E;
}

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Type guard to check if result is successful
 */
export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => {
  return result.success === true;
};

/**
 * Type guard to check if result is failure
 */
export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => {
  return result.success === false;
};

/**
 * Create a success result
 */
export const success = <T>(data: T): Success<T> => ({
  success: true,
  data
});

/**
 * Create a failure result
 */
export const failure = <E = Error>(error: E): Failure<E> => ({
  success: false,
  error
});

/**
 * Map over a successful result
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> => {
  if (isSuccess(result)) {
    return success(fn(result.data));
  }
  return result;
};

/**
 * Map over a failed result
 */
export const mapError = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> => {
  if (isFailure(result)) {
    return failure(fn(result.error));
  }
  return result;
};

/**
 * Chain results together
 */
export const chainResult = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> => {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
};

/**
 * Unwrap result or throw error
 */
export const unwrapResult = <T, E>(result: Result<T, E>): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  throw result.error;
};

/**
 * Unwrap result or return default value
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
};

/**
 * Convert promise to Result type
 */
export const fromPromise = async <T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    const mappedError = errorMapper ? errorMapper(error) : (error as E);
    return failure(mappedError);
  }
};

/**
 * Combine multiple results into a single result
 */
export const combineResults = <T, E>(
  results: Result<T, E>[]
): Result<T[], E> => {
  const data: T[] = [];
  
  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    data.push(result.data);
  }
  
  return success(data);
};

/**
 * Collect all successful results, ignoring failures
 */
export const collectSuccesses = <T, E>(
  results: Result<T, E>[]
): T[] => {
  return results
    .filter(isSuccess)
    .map(result => result.data);
};

/**
 * Collect all failures, ignoring successes
 */
export const collectFailures = <T, E>(
  results: Result<T, E>[]
): E[] => {
  return results
    .filter(isFailure)
    .map(result => result.error);
};
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants';
import { PaginationParams } from '../types/pagination.type';

export class PaginationUtil {
  static normalize(page?: number, limit?: number): PaginationParams {
    const normalizedPage = page && page > 0 ? page : 1;
    const normalizedLimit =
      limit && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
    return { page: normalizedPage, limit: normalizedLimit };
  }

  static toSkip(params: PaginationParams): number {
    return (params.page - 1) * params.limit;
  }
}

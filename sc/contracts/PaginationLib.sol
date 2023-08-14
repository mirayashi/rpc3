// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct Pagination {
    uint maxPage;
    uint currentPageSize;
    uint offset;
}

library PaginationLib {
    error MaxPageExceeded(uint maxPage);

    function paginate(
        uint currentPage,
        uint totalSize,
        uint maxPerPage
    ) internal pure returns (Pagination memory) {
        // It's an internal function so we won't check that maxPerPage > 0
        uint maxPage = totalSize / maxPerPage;
        uint lastPageSize = totalSize % maxPerPage;
        if (maxPage > 0 && lastPageSize == 0) {
            unchecked {
                --maxPage;
            }
        }
        if (currentPage > maxPage) revert MaxPageExceeded(maxPage);
        uint currentPageSize = currentPage == maxPage
            ? lastPageSize
            : maxPerPage;
        uint offset;
        unchecked {
            // currentPage <= maxPage and maxPage * maxPerPage <= totalSize
            offset = currentPage * maxPerPage;
        }
        return Pagination(maxPage, currentPageSize, offset);
    }
}

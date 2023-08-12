// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct Pagination {
    uint maxPage;
    uint currentPageSize;
    uint offset;
}

library PaginationLib {
    function paginate(
        uint currentPage,
        uint totalSize,
        uint maxPerPage
    ) internal pure returns (Pagination memory) {
        uint maxPage = totalSize / maxPerPage;
        uint lastPageSize = totalSize % maxPerPage;
        if (lastPageSize == 0) --maxPage;
        require(currentPage <= maxPage, "max page exceeded");
        uint currentPageSize = currentPage == maxPage
            ? lastPageSize
            : maxPerPage;
        uint offset = currentPage * maxPerPage;
        return Pagination(maxPage, currentPageSize, offset);
    }
}

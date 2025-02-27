// Lấy tất cả các liên kết module từ menu điều hướng
const moduleLinks = document.querySelectorAll(
  '.css-y3t86r > li a[data-test="rc-WeekNavigationItem"]'
);

// Hàm để đợi nội dung segment được tải
function waitForSegments() {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const segmentLists = document.querySelectorAll(
        '.rc-NamedItemListRefresh ul[data-testid="named-item-list-list"]'
      );
      if (segmentLists.length > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Hàm để trích xuất và in thông tin segment
function extractAndPrintSegments(moduleName) {
  const segmentLists = document.querySelectorAll(
    '.rc-NamedItemListRefresh ul[data-testid="named-item-list-list"]'
  );
  if (segmentLists.length > 0) {
    segmentLists.forEach((segmentList, listIndex) => {
      const segments = segmentList.querySelectorAll("li");
      segments.forEach((segment, segIndex) => {
        // Lấy tên segment
        const segmentName =
          segment
            .querySelector('p[data-test="rc-ItemName"]')
            ?.textContent.trim() || "Unnamed Segment";

        // Lấy loại segment
        let segmentType = "Unknown";
        const typeElement = segment.querySelector(".css-cgu8ti");
        if (typeElement) {
          segmentType = typeElement.textContent.trim();
        }

        // Kiểm tra trạng thái hoàn thành
        let status = "Not started";
        const statusElement = segment.querySelector('svg[role="img"]');
        if (statusElement) {
          const title = statusElement.querySelector("title");
          if (title && title.textContent.trim() === "Completed") {
            status = "Completed";
          }
        } else {
          const annotation = segment.querySelector(".rc-WeekItemAnnotations");
          if (annotation) {
            const text = annotation.textContent.trim();
            if (text.includes("Completed")) {
              status = "Completed";
            } else if (text.includes("Started")) {
              status = "Started";
            }
          }
        }

        // In ra thông tin segment
        console.log(
          `  Segment ${
            segIndex + 1
          }: ${segmentName} - Type: ${segmentType} - Status: ${status}`
        );
      });
    });
  } else {
    console.log("  No segments found for this module.");
  }
}

// Hàm chính để xử lý tất cả các module
async function processModules() {
  for (let i = 0; i < moduleLinks.length; i++) {
    const moduleLink = moduleLinks[i];
    const moduleName =
      moduleLink.querySelector(".css-xkyeje")?.textContent.trim() ||
      `Module ${i + 1}`;
    console.log(`Module: ${moduleName}`);

    // Bấm vào module
    moduleLink.click();

    // Đợi nội dung segment được tải
    await waitForSegments();

    // Trích xuất và in thông tin segment
    extractAndPrintSegments(moduleName);

    // Đợi một chút trước khi chuyển sang module tiếp theo
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log("Đã xử lý xong tất cả các module!");
}

// Chạy hàm chính
processModules();

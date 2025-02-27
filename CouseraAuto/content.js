// Hàm lấy userId từ localStorage
function getUserId() {
  const allKeys = Object.keys(localStorage);
  const key = allKeys.find((key) => key.includes("userPreferences"));
  if (!key) {
    console.error("Không tìm thấy userId trong localStorage");
    return "";
  }
  return key.split(".")[0];
}

// Hàm lấy danh sách item từ khóa học
async function getMaterialCourse(slug) {
  const response = await fetch(
    `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules%2Clessons%2CpassableItemGroups%2CpassableItemGroupChoices%2CpassableLessonElements%2Citems%2Ctracks%2CgradePolicy%2CgradingParameters%2CembeddedContentMapping&fields=moduleIds%2ConDemandCourseMaterialModules.v1(name%2Cslug%2Cdescription%2CtimeCommitment%2ClessonIds%2Coptional%2ClearningObjectives)%2ConDemandCourseMaterialLessons.v1(name%2Cslug%2CtimeCommitment%2CelementIds%2Coptional%2CtrackId)%2ConDemandCourseMaterialPassableItemGroups.v1(requiredPassedCount%2CpassableItemGroupChoiceIds%2CtrackId)%2ConDemandCourseMaterialPassableItemGroupChoices.v1(name%2Cdescription%2CitemIds)%2ConDemandCourseMaterialPassableLessonElements.v1(gradingWeight%2CisRequiredForPassing)%2ConDemandCourseMaterialItems.v2(name%2CoriginalName%2Cslug%2CtimeCommitment%2CcontentSummary%2CisLocked%2ClockableByItem%2CitemLockedReasonCode%2CtrackId%2ClockedStatus%2CitemLockSummary)%2ConDemandCourseMaterialTracks.v1(passablesCount)%2ConDemandGradingParameters.v1(gradedAssignmentGroups)%2CcontentAtomRelations.v1(embeddedContentSourceCourseId%2CsubContainerId)&showLockedItems=true`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      method: "GET",
      credentials: "include",
    }
  );

  const data = await response.json();
  let allItems = [];
  if (response.ok) {
    const lessons = data.linked["onDemandCourseMaterialLessons.v1"];
    const items = data.linked["onDemandCourseMaterialItems.v2"];
    lessons.forEach((lesson) => {
      lesson.itemIds.forEach((itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          allItems.push({
            id: itemId,
            type: item.contentSummary ? item.contentSummary.type : "unknown",
          });
        }
      });
    });
    return { items: allItems, course_id: data.elements[0].id };
  }
  console.error("Lỗi khi lấy dữ liệu khóa học:", response.status);
  return null;
}

// Hàm đánh dấu video hoàn thành
async function applyEndedVideo(itemId, slug) {
  const response = await fetch(
    `https://www.coursera.org/api/opencourse.v1/user/${getUserId()}/course/${slug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=UTF-8",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      body: '{"contentRequestBody":{}}',
      method: "POST",
      credentials: "include",
    }
  );
  console.log(`applyEndedVideo cho ${itemId}: ${response.status}`);
  return response.ok;
}

// Hàm đánh dấu tài liệu bổ sung hoàn thành
async function completeReading(itemId, course_id) {
  const payload = {
    userId: parseInt(getUserId()),
    itemId: itemId,
    courseId: course_id,
  };
  const response = await fetch(
    "https://www.coursera.org/api/onDemandSupplementCompletions.v1",
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=UTF-8",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      body: JSON.stringify(payload),
      method: "POST",
      credentials: "include",
    }
  );
  console.log(`completeReading cho ${itemId}: ${response.status}`);
  return response.ok;
}

// Hàm gửi trạng thái tổng quan đến popup
function updateStatus(message) {
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", status: message });
}

// Hàm gửi chi tiết từng bước thực thi đến popup
function updateProgress(message) {
  chrome.runtime.sendMessage({ type: "UPDATE_PROGRESS", progress: message });
}

// Hàm yêu cầu reload trang
function reloadPage() {
  chrome.runtime.sendMessage({ type: "RELOAD_PAGE" });
}

// Hàm chính xử lý khóa học
async function processCourse() {
  const slug = window.location.pathname.split("/")[2];
  const material = await getMaterialCourse(slug); // Giả sử hàm này đã có

  if (material && material.items.length > 0) {
    const totalItems = material.items.length;
    let completedItems = 0;

    for (let i = 0; i < material.items.length; i++) {
      const item = material.items[i];
      updateProgress(`Đang xử lý item ${item.id}...`);
      updateStatus(
        `Đang xử lý: ${i + 1}/${totalItems} (${Math.round(
          ((i + 1) / totalItems) * 100
        )}%)`
      );

      try {
        const promises = [
          applyEndedVideo(item.id, slug), // Giả sử hàm này đã có
          completeReading(item.id, material.course_id), // Giả sử hàm này đã có
        ];

        const results = await Promise.allSettled(promises);
        const success = results.some(
          (result) => result.status === "fulfilled" && result.value === true
        );

        if (success) {
          completedItems++;
          updateProgress(`Item ${item.id}: Thành công`);
        } else {
          updateProgress(`Item ${item.id}: Thất bại`);
        }
      } catch (error) {
        console.error(`Lỗi khi xử lý item ${item.id}:`, error);
        updateProgress(`Item ${item.id}: Lỗi - ${error.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 300)); // Delay giữa các item
    }

    updateStatus(`Hoàn thành: ${completedItems}/${totalItems}`);
    updateProgress(`Tất cả items đã được xử lý. Đang reload trang...`);
    reloadPage();
  } else {
    updateStatus("Không thể lấy dữ liệu khóa học.");
    updateProgress("Lỗi: Không thể lấy dữ liệu khóa học.");
  }
}

// Lắng nghe tin nhắn từ popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_PROCESS") {
    processCourse(); // Chỉ chạy khi nhận được tin nhắn
  }
});

chrome.runtime.onMessage.addListener((message) => {
  console.log("Content nhận:", message);
});

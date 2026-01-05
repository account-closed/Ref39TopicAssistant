import { Datastore, Topic, TShirtSize } from '../models';

const VALID_SIZES: TShirtSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

/**
 * Result of plausibility checks showing what was cleaned up.
 */
export interface PlausibilityResult {
  /** Whether any changes were made to the datastore */
  hasChanges: boolean;
  /** Number of invalid tag references removed from topics */
  removedTagReferences: number;
  /** Number of invalid member references removed from topics */
  removedMemberReferences: number;
  /** Number of topic field corrections made */
  correctedTopicFields: number;
  /** Detailed log of changes for debugging */
  changeLog: string[];
}

/**
 * Remove invalid tag references from topics.
 * A tag is invalid if it doesn't exist in the managed tags list.
 * @param datastore The datastore to check
 * @returns Updated datastore with invalid tags removed
 */
export function removeInvalidTagReferences(datastore: Datastore): {
  datastore: Datastore;
  removedCount: number;
  changeLog: string[];
} {
  const validTagNames = new Set((datastore.tags || []).map((t) => t.name));
  let removedCount = 0;
  const changeLog: string[] = [];

  // If no managed tags exist, keep all topic tags (backward compatibility)
  if (validTagNames.size === 0) {
    return { datastore, removedCount: 0, changeLog: [] };
  }

  const updatedTopics = datastore.topics.map((topic) => {
    if (topic.tags && topic.tags.length > 0) {
      const invalidTags = topic.tags.filter((tagName) => !validTagNames.has(tagName));
      if (invalidTags.length > 0) {
        removedCount += invalidTags.length;
        changeLog.push(
          `Topic "${topic.header}" (${topic.id}): removed invalid tags [${invalidTags.join(', ')}]`
        );
        return {
          ...topic,
          tags: topic.tags.filter((tagName) => validTagNames.has(tagName)),
        };
      }
    }
    return topic;
  });

  return {
    datastore: { ...datastore, topics: updatedTopics },
    removedCount,
    changeLog,
  };
}

/**
 * Remove invalid member references from topics.
 * A member reference is invalid if the member ID doesn't exist in the members array.
 * This checks r1MemberId, r2MemberId, r3MemberId, cMemberIds, and iMemberIds.
 * @param datastore The datastore to check
 * @returns Updated datastore with invalid member references removed
 */
export function removeInvalidMemberReferences(datastore: Datastore): {
  datastore: Datastore;
  removedCount: number;
  changeLog: string[];
} {
  const validMemberIds = new Set(datastore.members.map((m) => m.id));
  let removedCount = 0;
  const changeLog: string[] = [];

  const updatedTopics = datastore.topics.map((topic) => {
    const changes: string[] = [];
    let updatedRaci = { ...topic.raci };
    let hasChanges = false;

    // Check r1MemberId (required field - skip removal as it would break validation)
    // NOTE: r1MemberId is mandatory per schema. Invalid r1MemberId indicates data corruption
    // that requires manual intervention. We log it but don't auto-fix to avoid breaking topics.
    if (!validMemberIds.has(updatedRaci.r1MemberId)) {
      changes.push(`r1MemberId "${updatedRaci.r1MemberId}" is invalid (keeping as required field)`);
    }

    // Check r2MemberId (optional)
    if (updatedRaci.r2MemberId && !validMemberIds.has(updatedRaci.r2MemberId)) {
      changes.push(`removed r2MemberId "${updatedRaci.r2MemberId}"`);
      updatedRaci = { ...updatedRaci, r2MemberId: undefined };
      hasChanges = true;
      removedCount++;
    }

    // Check r3MemberId (optional)
    if (updatedRaci.r3MemberId && !validMemberIds.has(updatedRaci.r3MemberId)) {
      changes.push(`removed r3MemberId "${updatedRaci.r3MemberId}"`);
      updatedRaci = { ...updatedRaci, r3MemberId: undefined };
      hasChanges = true;
      removedCount++;
    }

    // Check cMemberIds
    const invalidCMembers = updatedRaci.cMemberIds.filter((id) => !validMemberIds.has(id));
    if (invalidCMembers.length > 0) {
      changes.push(`removed cMemberIds [${invalidCMembers.join(', ')}]`);
      updatedRaci = {
        ...updatedRaci,
        cMemberIds: updatedRaci.cMemberIds.filter((id) => validMemberIds.has(id)),
      };
      hasChanges = true;
      removedCount += invalidCMembers.length;
    }

    // Check iMemberIds
    const invalidIMembers = updatedRaci.iMemberIds.filter((id) => !validMemberIds.has(id));
    if (invalidIMembers.length > 0) {
      changes.push(`removed iMemberIds [${invalidIMembers.join(', ')}]`);
      updatedRaci = {
        ...updatedRaci,
        iMemberIds: updatedRaci.iMemberIds.filter((id) => validMemberIds.has(id)),
      };
      hasChanges = true;
      removedCount += invalidIMembers.length;
    }

    if (changes.length > 0) {
      changeLog.push(`Topic "${topic.header}" (${topic.id}): ${changes.join('; ')}`);
    }

    if (hasChanges) {
      return { ...topic, raci: updatedRaci };
    }
    return topic;
  });

  return {
    datastore: { ...datastore, topics: updatedTopics },
    removedCount,
    changeLog,
  };
}

/**
 * Validate and correct topic classification and reference fields.
 * - Priority must be between 1 and 10 (or undefined)
 * - Size must be a valid T-shirt size (or undefined)
 * - If hasFileNumber is false, fileNumber should be cleared
 * - If hasSharedFilePath is false, sharedFilePath should be cleared
 * @param datastore The datastore to check
 * @returns Updated datastore with corrected topic fields
 */
export function validateTopicFields(datastore: Datastore): {
  datastore: Datastore;
  correctedCount: number;
  changeLog: string[];
} {
  let correctedCount = 0;
  const changeLog: string[] = [];

  const updatedTopics = datastore.topics.map((topic) => {
    const changes: string[] = [];
    let updatedTopic = { ...topic };
    let hasChanges = false;

    // Validate priority (must be 1-10 or undefined)
    if (updatedTopic.priority !== undefined) {
      if (typeof updatedTopic.priority !== 'number' || updatedTopic.priority < 1 || updatedTopic.priority > 10) {
        changes.push(`invalid priority "${updatedTopic.priority}" removed`);
        updatedTopic = { ...updatedTopic, priority: undefined };
        hasChanges = true;
        correctedCount++;
      }
    }

    // Validate size (must be valid T-shirt size or undefined)
    if (updatedTopic.size !== undefined) {
      if (!VALID_SIZES.includes(updatedTopic.size)) {
        changes.push(`invalid size "${updatedTopic.size}" removed`);
        updatedTopic = { ...updatedTopic, size: undefined };
        hasChanges = true;
        correctedCount++;
      }
    }

    // Clear fileNumber if hasFileNumber is false
    if (!updatedTopic.hasFileNumber && updatedTopic.fileNumber) {
      changes.push(`fileNumber cleared because hasFileNumber is false`);
      updatedTopic = { ...updatedTopic, fileNumber: '' };
      hasChanges = true;
      correctedCount++;
    }

    // Clear sharedFilePath if hasSharedFilePath is false
    if (!updatedTopic.hasSharedFilePath && updatedTopic.sharedFilePath) {
      changes.push(`sharedFilePath cleared because hasSharedFilePath is false`);
      updatedTopic = { ...updatedTopic, sharedFilePath: '' };
      hasChanges = true;
      correctedCount++;
    }

    if (changes.length > 0) {
      changeLog.push(`Topic "${topic.header}" (${topic.id}): ${changes.join('; ')}`);
    }

    return hasChanges ? updatedTopic : topic;
  });

  return {
    datastore: { ...datastore, topics: updatedTopics },
    correctedCount,
    changeLog,
  };
}

/**
 * Run all plausibility checks on the datastore and return a cleaned version.
 * This function should be called before each save to ensure data consistency.
 * @param datastore The datastore to check
 * @returns Object containing the cleaned datastore and a summary of changes
 */
export function runPlausibilityChecks(datastore: Datastore): {
  datastore: Datastore;
  result: PlausibilityResult;
} {
  let currentDatastore = datastore;
  const allChangeLogs: string[] = [];
  let totalRemovedTags = 0;
  let totalRemovedMembers = 0;
  let totalCorrectedFields = 0;

  // 1. Remove invalid tag references
  const tagResult = removeInvalidTagReferences(currentDatastore);
  currentDatastore = tagResult.datastore;
  totalRemovedTags = tagResult.removedCount;
  allChangeLogs.push(...tagResult.changeLog);

  // 2. Remove invalid member references
  const memberResult = removeInvalidMemberReferences(currentDatastore);
  currentDatastore = memberResult.datastore;
  totalRemovedMembers = memberResult.removedCount;
  allChangeLogs.push(...memberResult.changeLog);

  // 3. Validate and correct topic fields (priority, size, references)
  const fieldResult = validateTopicFields(currentDatastore);
  currentDatastore = fieldResult.datastore;
  totalCorrectedFields = fieldResult.correctedCount;
  allChangeLogs.push(...fieldResult.changeLog);

  const hasChanges = totalRemovedTags > 0 || totalRemovedMembers > 0 || totalCorrectedFields > 0;

  if (hasChanges) {
    console.log('[Plausibility] Cleaned up datastore:', {
      removedTagReferences: totalRemovedTags,
      removedMemberReferences: totalRemovedMembers,
      correctedTopicFields: totalCorrectedFields,
      changeLog: allChangeLogs,
    });
  }

  return {
    datastore: currentDatastore,
    result: {
      hasChanges,
      removedTagReferences: totalRemovedTags,
      removedMemberReferences: totalRemovedMembers,
      correctedTopicFields: totalCorrectedFields,
      changeLog: allChangeLogs,
    },
  };
}

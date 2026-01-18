import { Datastore, Topic, TShirtSize, TopicConnectionType } from '../models';
import { isValidHexColor, normalizeHexColor } from '../../shared/utils/validation.utils';

const VALID_SIZES: TShirtSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const VALID_CONNECTION_TYPES: TopicConnectionType[] = ['dependsOn', 'blocks', 'relatedTo'];

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
  /** Number of member color corrections made */
  correctedMemberColors: number;
  /** Number of tag color corrections made */
  correctedTagColors: number;
  /** Number of invalid topic connections removed */
  removedTopicConnections: number;
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
 * Validate and normalize member color fields.
 * Removes invalid colors and normalizes valid ones to include # prefix.
 * @param datastore The datastore to check
 * @returns Updated datastore with corrected member colors
 */
export function validateMemberColors(datastore: Datastore): {
  datastore: Datastore;
  correctedCount: number;
  changeLog: string[];
} {
  let correctedCount = 0;
  const changeLog: string[] = [];

  const updatedMembers = datastore.members.map((member) => {
    if (member.color !== undefined) {
      if (!isValidHexColor(member.color)) {
        changeLog.push(`Member "${member.displayName}" (${member.id}): invalid color "${member.color}" removed`);
        correctedCount++;
        return { ...member, color: undefined };
      }
      const normalized = normalizeHexColor(member.color);
      if (normalized !== member.color) {
        changeLog.push(`Member "${member.displayName}" (${member.id}): color normalized from "${member.color}" to "${normalized}"`);
        correctedCount++;
        return { ...member, color: normalized };
      }
    }
    return member;
  });

  return {
    datastore: { ...datastore, members: updatedMembers },
    correctedCount,
    changeLog,
  };
}

/**
 * Validate and normalize tag color fields.
 * Removes invalid colors and normalizes valid ones to include # prefix.
 * @param datastore The datastore to check
 * @returns Updated datastore with corrected tag colors
 */
export function validateTagColors(datastore: Datastore): {
  datastore: Datastore;
  correctedCount: number;
  changeLog: string[];
} {
  let correctedCount = 0;
  const changeLog: string[] = [];

  if (!datastore.tags) {
    return { datastore, correctedCount: 0, changeLog: [] };
  }

  const updatedTags = datastore.tags.map((tag) => {
    if (tag.color !== undefined) {
      if (!isValidHexColor(tag.color)) {
        changeLog.push(`Tag "${tag.name}" (${tag.id}): invalid color "${tag.color}" removed`);
        correctedCount++;
        return { ...tag, color: undefined };
      }
      const normalized = normalizeHexColor(tag.color);
      if (normalized !== tag.color) {
        changeLog.push(`Tag "${tag.name}" (${tag.id}): color normalized from "${tag.color}" to "${normalized}"`);
        correctedCount++;
        return { ...tag, color: normalized };
      }
    }
    return tag;
  });

  return {
    datastore: { ...datastore, tags: updatedTags },
    correctedCount,
    changeLog,
  };
}

/**
 * Remove invalid topic connections.
 * A connection is invalid if:
 * - The target topic ID doesn't exist
 * - The connection type is not valid
 * - The connection is a self-reference (topic connected to itself)
 * - The connection is a duplicate
 * @param datastore The datastore to check
 * @returns Updated datastore with invalid connections removed
 */
export function removeInvalidTopicConnections(datastore: Datastore): {
  datastore: Datastore;
  removedCount: number;
  changeLog: string[];
} {
  const validTopicIds = new Set(datastore.topics.map((t) => t.id));
  let removedCount = 0;
  const changeLog: string[] = [];

  const updatedTopics = datastore.topics.map((topic) => {
    if (!topic.connections || topic.connections.length === 0) {
      return topic;
    }

    const changes: string[] = [];
    const seenConnections = new Set<string>();
    const validConnections = topic.connections.filter((connection) => {
      const connectionKey = `${connection.targetTopicId}:${connection.type}`;

      // Check for self-reference
      if (connection.targetTopicId === topic.id) {
        changes.push(`self-reference removed`);
        removedCount++;
        return false;
      }

      // Check for duplicate
      if (seenConnections.has(connectionKey)) {
        changes.push(`duplicate connection to "${connection.targetTopicId}" (${connection.type}) removed`);
        removedCount++;
        return false;
      }
      seenConnections.add(connectionKey);

      // Check for invalid target topic
      if (!validTopicIds.has(connection.targetTopicId)) {
        changes.push(`connection to non-existent topic "${connection.targetTopicId}" removed`);
        removedCount++;
        return false;
      }

      // Check for invalid connection type
      if (!VALID_CONNECTION_TYPES.includes(connection.type)) {
        changes.push(`connection with invalid type "${connection.type}" removed`);
        removedCount++;
        return false;
      }

      return true;
    });

    if (changes.length > 0) {
      changeLog.push(`Topic "${topic.header}" (${topic.id}): ${changes.join('; ')}`);
      return { ...topic, connections: validConnections };
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
  let totalCorrectedMemberColors = 0;
  let totalCorrectedTagColors = 0;
  let totalRemovedConnections = 0;

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

  // 4. Validate and correct member colors
  const memberColorResult = validateMemberColors(currentDatastore);
  currentDatastore = memberColorResult.datastore;
  totalCorrectedMemberColors = memberColorResult.correctedCount;
  allChangeLogs.push(...memberColorResult.changeLog);

  // 5. Validate and correct tag colors
  const tagColorResult = validateTagColors(currentDatastore);
  currentDatastore = tagColorResult.datastore;
  totalCorrectedTagColors = tagColorResult.correctedCount;
  allChangeLogs.push(...tagColorResult.changeLog);

  // 6. Remove invalid topic connections
  const connectionResult = removeInvalidTopicConnections(currentDatastore);
  currentDatastore = connectionResult.datastore;
  totalRemovedConnections = connectionResult.removedCount;
  allChangeLogs.push(...connectionResult.changeLog);

  const hasChanges = totalRemovedTags > 0 || totalRemovedMembers > 0 || totalCorrectedFields > 0 || totalCorrectedMemberColors > 0 || totalCorrectedTagColors > 0 || totalRemovedConnections > 0;

  if (hasChanges) {
    console.log('[Plausibility] Cleaned up datastore:', {
      removedTagReferences: totalRemovedTags,
      removedMemberReferences: totalRemovedMembers,
      correctedTopicFields: totalCorrectedFields,
      correctedMemberColors: totalCorrectedMemberColors,
      correctedTagColors: totalCorrectedTagColors,
      removedTopicConnections: totalRemovedConnections,
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
      correctedMemberColors: totalCorrectedMemberColors,
      correctedTagColors: totalCorrectedTagColors,
      removedTopicConnections: totalRemovedConnections,
      changeLog: allChangeLogs,
    },
  };
}

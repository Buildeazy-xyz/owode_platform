"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGroupBalanced = exports.assessGroupRisk = exports.isEligibleForGuaranteedAjo = exports.getTrustColor = exports.getTrustLabel = exports.updateTrustScore = exports.calculateTrustScore = void 0;
const database_1 = require("../config/database");
// Calculate trust score for a user (0-100)
const calculateTrustScore = async (userId) => {
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId },
        include: {
            ajoMembers: {
                include: { group: true }
            },
            defaultRecords: true
        }
    });
    if (!user)
        return 0;
    let score = 50; // Base score
    // +10 if BVN submitted
    if (user.bvn)
        score += 10;
    // +10 if NIN submitted
    if (user.nin)
        score += 10;
    // +10 if verified
    if (user.isVerified)
        score += 10;
    // +5 for each completed Ajo group
    const completedGroups = user.ajoMembers.filter((m) => !m.group.isActive).length;
    score += Math.min(completedGroups * 5, 20);
    // -15 for each default
    const defaults = user.defaultRecords.length;
    score -= defaults * 15;
    // -5 for each unrecovered default
    const unrecovered = user.defaultRecords.filter((d) => d.recoveryStatus !== 'RECOVERED').length;
    score -= unrecovered * 5;
    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, score));
};
exports.calculateTrustScore = calculateTrustScore;
// Update trust score in database
const updateTrustScore = async (userId) => {
    const score = await (0, exports.calculateTrustScore)(userId);
    await database_1.prisma.user.update({
        where: { id: userId },
        data: { trustScore: score }
    });
    return score;
};
exports.updateTrustScore = updateTrustScore;
// Get trust score label
const getTrustLabel = (score) => {
    if (score >= 80)
        return 'Excellent';
    if (score >= 65)
        return 'Good';
    if (score >= 50)
        return 'Fair';
    if (score >= 35)
        return 'Poor';
    return 'Very Poor';
};
exports.getTrustLabel = getTrustLabel;
// Get trust color
const getTrustColor = (score) => {
    if (score >= 80)
        return '#22c55e';
    if (score >= 65)
        return '#84cc16';
    if (score >= 50)
        return '#f5a623';
    if (score >= 35)
        return '#f97316';
    return '#ef4444';
};
exports.getTrustColor = getTrustColor;
// Check if user is eligible for guaranteed Ajo
const isEligibleForGuaranteedAjo = async (userId) => {
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        return false;
    if (!user.bvn && !user.nin)
        return false;
    if (!user.isVerified)
        return false;
    if (user.trustScore < 35)
        return false;
    return true;
};
exports.isEligibleForGuaranteedAjo = isEligibleForGuaranteedAjo;
// Add these functions to trust.service.ts
// Full risk assessment for group joining
const assessGroupRisk = async (groupId) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: groupId },
        include: {
            members: {
                include: { user: true }
            }
        }
    });
    if (!group)
        throw new Error('Group not found');
    const realMembers = group.members.filter((m) => !m.isAvatar);
    // Calculate group risk score
    const avgTrustScore = realMembers.length > 0
        ? realMembers.reduce((sum, m) => sum + m.user.trustScore, 0) / realMembers.length
        : 0;
    const highRiskMembers = realMembers.filter((m) => m.user.trustScore < 50).length;
    const lowRiskMembers = realMembers.filter((m) => m.user.trustScore >= 65).length;
    return {
        groupId,
        averageTrustScore: avgTrustScore,
        highRiskMembers,
        lowRiskMembers,
        riskLevel: avgTrustScore >= 65 ? 'LOW' : avgTrustScore >= 50 ? 'MEDIUM' : 'HIGH',
        recommendation: highRiskMembers > lowRiskMembers
            ? 'High risk group — Avatar coverage likely needed'
            : 'Balanced group — Low default probability'
    };
};
exports.assessGroupRisk = assessGroupRisk;
// Check if group has too many high risk members
const isGroupBalanced = async (groupId) => {
    const assessment = await (0, exports.assessGroupRisk)(groupId);
    return assessment.highRiskMembers <= assessment.lowRiskMembers;
};
exports.isGroupBalanced = isGroupBalanced;
//# sourceMappingURL=trust.service.js.map
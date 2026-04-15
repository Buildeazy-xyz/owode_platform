import { prisma } from '../config/database'

// Create a new Ajo group
export const createAjoGroup = async (data: {
  name: string
  amount: number
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  totalMembers: number
  createdBy: string
}) => {
  // Check if group name already exists
  const existing = await prisma.ajoGroup.findFirst({
    where: { name: data.name }
  })

  if (existing) {
    throw new Error('Group name already exists')
  }

  // Create the group
  const group = await prisma.ajoGroup.create({
    data: {
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      totalMembers: data.totalMembers,
      createdBy: data.createdBy,
      currentCycle: 0,
      isActive: true
    }
  })

  return group
}

// Join an Ajo group
export const joinAjoGroup = async (data: {
  groupId: string
  userId: string
}) => {
  // Check if group exists
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  if (!group.isActive) {
    throw new Error('Group is no longer active')
  }

  // Check if group is full
  if (group.members.length >= group.totalMembers) {
    throw new Error('Group is full')
  }

  // Check if user already joined
  const alreadyJoined = group.members.find(m => m.userId === data.userId)
  if (alreadyJoined) {
    throw new Error('You have already joined this group')
  }

  // Assign position based on how many members are already in
  const position = group.members.length + 1

  const member = await prisma.ajoMember.create({
    data: {
      groupId: data.groupId,
      userId: data.userId,
      position,
      hasPaid: false
    }
  })

  return { member, group }
}

// Get all active Ajo groups
export const getAllGroups = async () => {
  const groups = await prisma.ajoGroup.findMany({
    where: { isActive: true },
    include: { members: true }
  })

  return groups
}

// Get a single Ajo group
export const getGroupById = async (groupId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: true }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  return group
}
"use server";

import { getUser } from "@/lib/auth";
import { generateRandomId } from "@/lib/utils";
import prisma from "@/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import OpenAI from "openai";

export type Message = {
  message: string;
  apiKey: string;
  conversationId: string;
};

export type NewMessage = Omit<Message, "conversationId">;

export type JSONMessage = {
  id: string;
  question: string;
  answer: string | undefined;
};

export async function newChat(params: NewMessage) {
  const session = await getUser();
  if (!session?.user) redirect("/login");
  let id: string | undefined;
  let error: undefined | { message: string };
  try {
    const responseMessage = await createCompletion(
      params.apiKey,
      params.message
    );
    const newConversationId = generateRandomId(8);
    const newMessageJson = [
      {
        id: newConversationId,
        question: params.message,
        answer: responseMessage.message.content,
      },
    ];
    const dataRef = await prisma.conversation.create({
      data: {
        messages: newMessageJson,
        name: params.message,
        userId: session.user.id,
      },
    });
    id = dataRef.id;
  } catch (err) {
    if (err instanceof Error) error = { message: err.message };
  }
  console.log(error);

  if (error) return error;
  redirect(`/chat/${id}`);
}

export async function chat(params: Message) {
  let error: undefined | { message: string };
  try {
    const responseMessage = await createCompletion(
      params.apiKey,
      params.message
    );
    const newConversationId = generateRandomId(8);
    const dataRef = await prisma.conversation.findUnique({
      where: {
        id: params.conversationId,
      },
    });
    const updatedMessageJson = [
      ...JSON.parse(JSON.stringify(dataRef?.messages)!),
      {
        id: newConversationId,
        question: params.message,
        answer: responseMessage.message.content,
      },
    ];
    await prisma.conversation.update({
      where: {
        id: params.conversationId,
      },
      data: {
        messages: updatedMessageJson,
      },
    });
  } catch (err) {
    if (err instanceof Error) error = { message: err.message };
  }
  console.log(error);

  if (error) return error;
  revalidatePath(`/chat/${params.conversationId}`);
}

async function createCompletion(apiKey: string, message: string) {
  const ai = new OpenAI({
    apiKey,
  });
  const chatCompletion = await ai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gpt-3.5-turbo",
  });
  return chatCompletion.choices[0];
}

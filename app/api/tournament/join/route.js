import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { db } from "../../../lib/firebase";
import { doc, updateDoc, increment, getDoc } from "firebase/firestore";
import {
  calculateLevelFromMatches,
  sumProtectionPointsBetween,
} from "../../../lib/levelConfig";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const email = formData.get("email");
    const tournamentName = formData.get("tournamentName");
    const tournamentId = formData.get("tournamentId")?.toString().trim();

    const entryFeeStr = formData.get("entryFee") || "10";
    const entryFee = Number(entryFeeStr);

    const ign = formData.get("ign");
    const uid = formData.get("uid");
    const whatsapp_number = formData.get("whatsapp_number");

    const gameType = formData.get("gameType") || "BGMI";
    const mode = formData.get("mode") || "solo";
    const mapName =
      formData.get("mapName") ||
      (gameType === "Free Fire" ? "Bermuda" : "Erangel");


    if (!email) {
      return NextResponse.json(
        { success:false, message:"Email is required" },
        { status:400 }
      );
    }


    if (!tournamentId) {
      return NextResponse.json(
        { success:false, message:"Tournament ID is required" },
        { status:400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success:false, message:"User not found" },
        { status:404 }
      );
    }


    // Wallet check
    const currentBalance = user.depositWallet || 0;

    if (currentBalance < entryFee) {
      return NextResponse.json(
        {
          success:false,
          message:"Insufficient deposit balance"
        },
        { status:400 }
      );
    }


    // Duplicate join protection
    /*
    const existingJoin = await prisma.matchHistory.findFirst({
      where:{
        userId:user.id,
        tournamentId:tournamentId,
      },
    });


    if(existingJoin){
      return NextResponse.json(
        {
          success:false,
          message:"You have already joined this tournament"
        },
        {status:400}
      );
    }
      */


    // Firebase tournament slot check
    const tournamentRef = doc(
      db,
      "tournaments",
      tournamentId
    );

    const tournamentSnap = await getDoc(tournamentRef);


    if(!tournamentSnap.exists()){
      return NextResponse.json(
        {
          success:false,
          message:"Tournament not found"
        },
        {status:404}
      );
    }


    const tournamentData = tournamentSnap.data();

    const maxSlots = tournamentData.maxSlots || 100;
    const joinedCount = tournamentData.joinedCount || 0;


    if(joinedCount >= maxSlots){
      return NextResponse.json(
        {
          success:false,
          message:"Tournament is full"
        },
        {status:400}
      );
    }

    // Cloudinary screenshot upload
    let screenshotUrl = null;

    if (file && typeof file === "object" && file.size > 0) {

      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          {
            success:false,
            message:"Only image files are allowed"
          },
          {status:400}
        );
      }


      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          {
            success:false,
            message:"Image size should be less than 5MB"
          },
          {status:400}
        );
      }


      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const base64Data =
        `data:${file.type};base64,${buffer.toString("base64")}`;


      const uploadResult = await cloudinary.uploader.upload(
        base64Data,
        {
          folder:"battle-crown-screenshots",
          resource_type:"image",
        }
      );


      screenshotUrl = uploadResult.secure_url;
    }



    // Level calculation

    const oldLevel = user.level;

    const newMatchesPlayed = user.matchesPlayed + 1;

    const newLevel = calculateLevelFromMatches(
      newMatchesPlayed
    );


    const protectionPointsGained =
      newLevel > oldLevel
        ? sumProtectionPointsBetween(
            oldLevel,
            newLevel
          )
        : 0;

        // Database transaction
    const result = await prisma.$transaction(async (tx) => {

      const updatedUser = await tx.user.update({
        where:{
          email:email,
        },
        data:{
          depositWallet:{
            decrement:entryFee,
          },

          crowns:{
            increment:1,
          },

          matchesPlayed:{
            increment:1,
          },

          level:newLevel,

          protectionPoints:{
            increment:protectionPointsGained,
          },

          lastMatchAt:new Date(),
        },
      });



      const newMatchHistory =
        await tx.matchHistory.create({

          data:{

            userId:user.id,

            tournamentId:tournamentId,

            tournamentName:
              tournamentName ||
              `${gameType} Tournament`,

            ign:ign || "Player",

            uid:uid ? String(uid) : "",

            whatsapp_number:
              whatsapp_number
              ? String(whatsapp_number)
              : "",

            email:email,

            screenshotUrl:screenshotUrl,

            mapName:mapName,

            gameType:gameType,

            mode:mode,

            entryFee:String(entryFee),

            status:"Pending Verification",

            playerLevel:newLevel,
          },

        });



      return {
        updatedUser,
        newMatchHistory,
      };

    });



    // Firebase joined count update

    let firebaseSyncFailed = false;

    try {

      await updateDoc(
        tournamentRef,
        {
          joinedCount:increment(1),
        }
      );


    } catch(error){

      firebaseSyncFailed = true;

      console.error(
        "Firebase sync failed:",
        error.message
      );

    }



    return NextResponse.json({

      success:true,

      message:
        newLevel > oldLevel
        ? `Tournament joined! Level ${newLevel}`
        : "Tournament joined successfully",

      matchHistoryId:
        result.newMatchHistory.id,


     match:{
        id:result.newMatchHistory.id,
      },


      depositWallet:
        result.updatedUser.depositWallet,

      crowns:
        result.updatedUser.crowns,

      matchesPlayed:
        result.updatedUser.matchesPlayed,

      level:
        result.updatedUser.level,

      protectionPoints:
        result.updatedUser.protectionPoints,

      firebaseSyncFailed,

    });


  } catch(error){

    console.error(
      "Tournament join error:",
      error
    );


    return NextResponse.json(
      {
        success:false,
        message:error.message,
      },
      {
        status:500,
      }
    );

  }

}
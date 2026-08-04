import { NextResponse } from "next/server";
import { db } from "../../lib/firebase"; 
import { collection, getDocs } from "firebase/firestore";

export async function GET() {
  try {
    // Firebase ke 'tournaments' collection se data fetch kar rahe hain
    const querySnapshot = await getDocs(collection(db, "tournaments"));
    const tournaments = [];

    querySnapshot.forEach((doc) => {
      tournaments.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return NextResponse.json({ success: true, tournaments });
  } catch (error) {
    console.error("Error fetching tournaments from Firebase:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
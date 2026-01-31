
import React from "react";

const PageHeader = ({ heading, subHeading }) => {
  
  return (
    <div className="flex justify-between items-center p-8 pb-4 bg-white">
      {/* Left side */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{heading}</h1>
        <p className="text-sm text-gray-500">{subHeading}</p>
      </div>

     
      
    </div>
  );
};

export default PageHeader;

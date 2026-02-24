
import React from "react";

const PageHeader = ({ heading, subHeading }) => {
  
  return (
    <div className="flex justify-between items-center px-6 pt-4 pb-2 bg-white">
      {/* Left side */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{heading}</h1>
        <p className="text-xs text-gray-500">{subHeading}</p>
      </div>

     
      
    </div>
  );
};

export default PageHeader;
